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
  documentId?: string;
}

export interface IngestBufferOptions {
  tenant: Tenant;
  buffer: Buffer;
  fileName: string;
  embedFn: (texts: string[]) => Promise<number[][]>;
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

const MAX_ERROR_LENGTH = 500;

function truncateError(message: string): string {
  if (message.length <= MAX_ERROR_LENGTH) return message;
  return `${message.slice(0, MAX_ERROR_LENGTH)}…`;
}

/**
 * Core ingestion pipeline operating on an in-memory buffer. This is the
 * authoritative implementation — `ingestSingleFile` is a thin wrapper that
 * reads from disk and delegates here. The API upload path (F1-S03) will call
 * this directly, ensuring a single pipeline with no divergence.
 *
 * Failure strategy after `INSERT documents`:
 * If the happy-path transaction (insert doc + chunks) throws, we attempt a
 * short out-of-transaction UPDATE to mark the row as `failed`. Drizzle does
 * not support savepoints, so nested transactions are not viable here.
 */
export async function ingestBuffer(
  opts: IngestBufferOptions,
): Promise<IngestFileResult> {
  const { tenant, buffer, fileName, embedFn } = opts;
  const env = getEnv();
  const startMs = Date.now();

  const log = logger.child({
    component: "ingest",
    tenantSlug: tenant.slug,
    fileName,
  });

  if (!isSupportedFile(fileName)) {
    return { fileName, filePath: "", status: "failed", reason: "unsupported_extension" };
  }

  if (buffer.length === 0) {
    return { fileName, filePath: "", status: "failed", reason: "empty_buffer" };
  }

  const contentHash = sha256Hex(buffer);

  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, tenant.id),
        eq(documents.contentHash, contentHash),
      ),
    )
    .limit(1);

  if (existing[0]) {
    log.info(
      { contentHash: contentHash.slice(0, 12) },
      "ingest_skipped_duplicate",
    );
    return { fileName, filePath: "", status: "skipped_duplicate" };
  }

  // Text extraction — empty result is a hard failure before any DB work
  let text: string;
  try {
    text = await extractTextFromBuffer(fileName, buffer);
  } catch (err) {
    const reason = truncateError(
      err instanceof Error ? err.message : String(err),
    );
    return { fileName, filePath: "", status: "failed", reason };
  }

  if (!text.trim()) {
    return { fileName, filePath: "", status: "failed", reason: "empty_extracted_text" };
  }

  const chunks = chunkText(text, {
    chunkSizeTokens: env.CHUNK_SIZE_TOKENS,
    overlapTokens: env.CHUNK_OVERLAP_TOKENS,
  });

  if (chunks.length === 0) {
    return {
      fileName,
      filePath: "",
      status: "failed",
      reason: "chunker_produced_zero_chunks",
    };
  }

  // Embed then persist in a single transaction. If anything throws after the
  // document row is created, we update it to `failed` outside the transaction.
  let documentId: string | undefined;

  try {
    const vectors = await embedFn(chunks.map((c) => c.content));
    if (vectors.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch: ${vectors.length} vs ${chunks.length}`,
      );
    }

    await db.transaction(async (tx) => {
      const now = new Date();
      const insertedDocs = await tx
        .insert(documents)
        .values({
          tenantId: tenant.id,
          fileName,
          // Buffer-based ingestion has no canonical disk path
          filePath: "",
          mimeType: getMimeType(fileName),
          contentHash,
          status: "ready",
          processedAt: now,
        })
        .returning({ id: documents.id });

      const insertedDoc = insertedDocs[0];
      if (!insertedDoc) {
        throw new Error("Failed to insert document row");
      }
      documentId = insertedDoc.id;

      await tx.insert(documentChunks).values(
        chunks.map((c, i) => {
          const vector = vectors[i];
          if (!vector) {
            throw new Error(`Missing vector for chunk index ${i}`);
          }
          return {
            tenantId: tenant.id,
            documentId: insertedDoc.id,
            chunkIndex: c.index,
            content: c.content,
            embedding: vector,
            tokenCount: c.tokenCount,
          };
        }),
      );
    });

    const latencyMs = Date.now() - startMs;
    log.info(
      {
        contentHash: contentHash.slice(0, 12),
        chunks: chunks.length,
        status: "ingested",
        latencyMs,
      },
      "ingest_file_complete",
    );

    return {
      fileName,
      filePath: "",
      status: "ingested",
      chunks: chunks.length,
      documentId,
    };
  } catch (err) {
    const reason = truncateError(
      err instanceof Error ? err.message : String(err),
    );
    const latencyMs = Date.now() - startMs;

    log.error(
      { contentHash: contentHash.slice(0, 12), reason, latencyMs },
      "ingest_file_failed",
    );

    // If the document row was created before the error, mark it as failed
    // in a separate short transaction (no nested tx / savepoints).
    if (documentId) {
      await db
        .update(documents)
        .set({ status: "failed", error: reason, processedAt: new Date() })
        .where(eq(documents.id, documentId))
        .catch((updateErr: unknown) => {
          log.error(
            { documentId, error: String(updateErr) },
            "ingest_failed_status_update_error",
          );
        });
    }

    return { fileName, filePath: "", status: "failed", reason };
  }
}

/**
 * Idempotent ingestion of all documents under `rootDir`. Each top-level
 * subfolder is mapped to a tenant via `getTenantConfigByFolder`. Files that
 * have already been ingested (same content hash for that tenant) are skipped
 * thanks to the `(tenant_id, content_hash)` UNIQUE constraint and a
 * pre-check that avoids burning embedding tokens.
 */
export async function ingestDirectory(rootDir: string): Promise<IngestReport> {
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
        log.error({ filePath, error: message }, "ingest_file_error");
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

  return { rootDir: absRoot, tenants: tenantResults };
}

/**
 * Reads `filePath` from disk and delegates to `ingestBuffer`. Preserves the
 * canonical file path in the result for CLI reporting.
 */
export async function ingestSingleFile(
  opts: IngestSingleFileOptions,
): Promise<IngestFileResult> {
  const buffer = await fs.readFile(opts.filePath);
  const result = await ingestBuffer({
    tenant: opts.tenant,
    buffer,
    fileName: opts.fileName,
    embedFn: opts.embedFn,
  });
  // Restore the real filePath for CLI output (buffer-path is empty string)
  return { ...result, filePath: opts.filePath };
}

export function expectedTenantFolders(): string[] {
  return TENANT_CONFIGS.flatMap((t) => t.documentFolders);
}
