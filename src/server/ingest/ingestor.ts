import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { documentChunks, documents, type Tenant } from "@/server/db/schema";
import { getEnv } from "@/lib/env";
import { generateEmbeddings } from "@/server/ai/embeddings";
import { chunkText } from "@/server/rag/chunker";
import { logger } from "@/server/logging/logger";
import {
  getTenantConfigByFolder,
  TENANT_CONFIGS,
} from "@/server/tenants/config";
import { getOrCreateTenant } from "@/server/tenants/service";
import { extractTextFromBuffer, getMimeType, isSupportedFile } from "./parsers";
import { sha256Hex } from "./hash";

export interface IngestFileResult {
  fileName: string;
  filePath: string;
  status: "skipped_duplicate" | "ingested" | "failed";
  chunks?: number;
  reason?: string;
}

export interface IngestTenantResult {
  tenantSlug: string;
  files: IngestFileResult[];
}

export interface IngestReport {
  rootDir: string;
  tenants: IngestTenantResult[];
}

interface IngestSingleFileOptions {
  tenant: Tenant;
  filePath: string;
  fileName: string;
  embedFn: (texts: string[]) => Promise<number[][]>;
}

/**
 * Idempotent ingestion of all documents under `rootDir`. Each top-level
 * subfolder is mapped to a tenant via `getTenantConfigByFolder`. Files that
 * have already been ingested (same content hash for that tenant) are skipped
 * thanks to the `(tenant_id, content_hash)` UNIQUE constraint and a
 * pre-check that avoids burning embedding tokens.
 */
export async function ingestDirectory(rootDir: string): Promise<IngestReport> {
  const env = getEnv();
  const absRoot = resolve(rootDir);
  const log = logger.child({ component: "ingest", rootDir: absRoot });

  const stat = await fs.stat(absRoot).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Documents directory does not exist: ${absRoot}`);
  }

  const subdirs = (await fs.readdir(absRoot, { withFileTypes: true })).filter(
    (d) => d.isDirectory(),
  );

  const tenantResults: IngestTenantResult[] = [];

  for (const dirent of subdirs) {
    const folderName = dirent.name;
    const tenantConfig = getTenantConfigByFolder(folderName);
    if (!tenantConfig) {
      log.warn({ folderName }, "ingest_skip_unknown_folder");
      continue;
    }

    const tenant = await getOrCreateTenant(tenantConfig.slug);
    const folderPath = join(absRoot, folderName);
    const files = await fs.readdir(folderPath, { withFileTypes: true });

    const fileResults: IngestFileResult[] = [];
    for (const fileEntry of files) {
      if (!fileEntry.isFile()) continue;
      if (!isSupportedFile(fileEntry.name)) {
        fileResults.push({
          fileName: fileEntry.name,
          filePath: join(folderPath, fileEntry.name),
          status: "failed",
          reason: "unsupported_extension",
        });
        continue;
      }
      const filePath = join(folderPath, fileEntry.name);
      try {
        const result = await ingestSingleFile({
          tenant,
          filePath,
          fileName: fileEntry.name,
          embedFn: async (texts) => (await generateEmbeddings(texts)).vectors,
        });
        fileResults.push(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({ filePath, error: message }, "ingest_file_failed");
        fileResults.push({
          fileName: fileEntry.name,
          filePath,
          status: "failed",
          reason: message,
        });
      }
    }

    tenantResults.push({
      tenantSlug: tenant.slug,
      files: fileResults,
    });
  }

  log.info(
    {
      tenants: tenantResults.map((t) => ({
        tenant: t.tenantSlug,
        ingested: t.files.filter((f) => f.status === "ingested").length,
        skipped: t.files.filter((f) => f.status === "skipped_duplicate").length,
        failed: t.files.filter((f) => f.status === "failed").length,
      })),
    },
    "ingest_summary",
  );

  return {
    rootDir: absRoot,
    tenants: tenantResults,
  };

  // Hint for the linter: env may be needed in callers
  // (kept here only because the embedding model is referenced upstream)
  void env;
}

export async function ingestSingleFile(
  opts: IngestSingleFileOptions,
): Promise<IngestFileResult> {
  const env = getEnv();
  const buffer = await fs.readFile(opts.filePath);
  const contentHash = sha256Hex(buffer);

  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, opts.tenant.id),
        eq(documents.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return {
      fileName: opts.fileName,
      filePath: opts.filePath,
      status: "skipped_duplicate",
    };
  }

  const text = await extractTextFromBuffer(opts.fileName, buffer);
  if (!text.trim()) {
    return {
      fileName: opts.fileName,
      filePath: opts.filePath,
      status: "failed",
      reason: "empty_extracted_text",
    };
  }

  const chunks = chunkText(text, {
    chunkSizeTokens: env.CHUNK_SIZE_TOKENS,
    overlapTokens: env.CHUNK_OVERLAP_TOKENS,
  });
  if (chunks.length === 0) {
    return {
      fileName: opts.fileName,
      filePath: opts.filePath,
      status: "failed",
      reason: "chunker_produced_zero_chunks",
    };
  }

  const vectors = await opts.embedFn(chunks.map((c) => c.content));
  if (vectors.length !== chunks.length) {
    throw new Error(
      `Embedding count mismatch: ${vectors.length} vs ${chunks.length}`,
    );
  }

  await db.transaction(async (tx) => {
    const insertedDocs = await tx
      .insert(documents)
      .values({
        tenantId: opts.tenant.id,
        fileName: opts.fileName,
        filePath: opts.filePath,
        mimeType: getMimeType(opts.fileName),
        contentHash,
        status: "ready",
      })
      .returning({ id: documents.id });
    const insertedDoc = insertedDocs[0];
    if (!insertedDoc) {
      throw new Error("Failed to insert document row");
    }

    await tx.insert(documentChunks).values(
      chunks.map((c, i) => {
        const vector = vectors[i];
        if (!vector) {
          throw new Error(`Missing vector for chunk index ${i}`);
        }
        return {
          tenantId: opts.tenant.id,
          documentId: insertedDoc.id,
          chunkIndex: c.index,
          content: c.content,
          embedding: vector,
          tokenCount: c.tokenCount,
        };
      }),
    );
  });

  return {
    fileName: opts.fileName,
    filePath: opts.filePath,
    status: "ingested",
    chunks: chunks.length,
  };
}

export function expectedTenantFolders(): string[] {
  return TENANT_CONFIGS.flatMap((t) => t.documentFolders);
}
