import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { generateEmbeddings } from "@/server/ai/embeddings";
import { db } from "@/server/db/client";
import { documents } from "@/server/db/schema";
import { ingestBuffer } from "@/server/ingest/ingestor";
import { isSupportedFile } from "@/server/ingest/parsers";
import { logger } from "@/server/logging/logger";
import { buildCorsHeaders, isOriginAllowed } from "@/server/security/cors";
import { TENANT_SLUGS } from "@/server/tenants/config";
import {
  getOrCreateTenant,
  TenantNotFoundError,
} from "@/server/tenants/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const TenantSlugSchema = z.enum(TENANT_SLUGS as [string, ...string[]]);

const GetQuerySchema = z.object({
  tenant: TenantSlugSchema,
  limit: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? 50 : Number(v)))
    .pipe(z.number().int().min(1).max(200)),
  cursor: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

interface CursorPayload {
  createdAt: string;
  id: string;
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString("base64url");
}

function decodeCursor(raw: string): CursorPayload {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)["createdAt"] !== "string" ||
      typeof (parsed as Record<string, unknown>)["id"] !== "string"
    ) {
      throw new Error("Invalid cursor shape");
    }
    return parsed as CursorPayload;
  } catch {
    throw new Error("Invalid cursor");
  }
}

// ---------------------------------------------------------------------------
// OPTIONS — preflight for both POST and GET
// ---------------------------------------------------------------------------

export async function OPTIONS(req: NextRequest) {
  const headers = buildCorsHeaders(req.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers });
}

// ---------------------------------------------------------------------------
// POST /api/documents
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (origin && !isOriginAllowed(origin)) {
    return NextResponse.json(
      { error: "Origin not allowed" },
      { status: 403, headers: corsHeaders },
    );
  }

  const routeLog = logger.child({ route: "documents", method: "POST" });
  const startMs = Date.now();

  const env = getEnv();
  const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;

  // Pre-check via content-length header to reject huge uploads before allocating memory.
  const rawContentLength = req.headers.get("content-length");
  if (rawContentLength !== null) {
    const byteLength = Number(rawContentLength);
    if (!Number.isNaN(byteLength) && byteLength > maxBytes) {
      return NextResponse.json(
        { error: `File exceeds maximum allowed size of ${env.MAX_UPLOAD_SIZE_MB} MB` },
        { status: 413, headers: corsHeaders },
      );
    }
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Failed to parse multipart/form-data body" },
      { status: 400, headers: corsHeaders },
    );
  }

  // Validate tenant field
  const rawTenant = formData.get("tenant");
  const tenantParsed = TenantSlugSchema.safeParse(rawTenant);
  if (!tenantParsed.success) {
    return NextResponse.json(
      {
        error: "Payload inválido",
        issues: [{ path: "tenant", message: "tenant slug desconhecido ou ausente" }],
      },
      { status: 400, headers: corsHeaders },
    );
  }
  const tenantSlug = tenantParsed.data;

  // Validate file field
  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json(
      {
        error: "Payload inválido",
        issues: [{ path: "file", message: "campo file ausente ou inválido" }],
      },
      { status: 400, headers: corsHeaders },
    );
  }

  const fileName = fileEntry.name;

  // Validate extension before reading the whole buffer
  if (!isSupportedFile(fileName)) {
    routeLog.warn({ tenantSlug, fileName }, "documents_upload_unsupported_extension");
    return NextResponse.json(
      { error: "Tipo de arquivo não suportado. Formatos aceitos: pdf, docx, xlsx, md, txt" },
      { status: 415, headers: corsHeaders },
    );
  }

  // Read buffer and enforce size limit (post-parse guard in case content-length header was absent)
  const arrayBuffer = await fileEntry.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const bytesIn = buffer.byteLength;

  if (bytesIn > maxBytes) {
    return NextResponse.json(
      { error: `File exceeds maximum allowed size of ${env.MAX_UPLOAD_SIZE_MB} MB` },
      { status: 413, headers: corsHeaders },
    );
  }

  // Resolve tenant — rejects if slug is not in registry or row missing
  let tenant;
  try {
    tenant = await getOrCreateTenant(tenantSlug);
  } catch (err) {
    if (err instanceof TenantNotFoundError) {
      return NextResponse.json(
        { error: "Tenant não encontrado" },
        { status: 404, headers: corsHeaders },
      );
    }
    routeLog.error(
      { tenantSlug, err: err instanceof Error ? err.message : String(err) },
      "documents_upload_tenant_resolve_error",
    );
    return NextResponse.json(
      { error: "Erro interno ao resolver tenant" },
      { status: 500, headers: corsHeaders },
    );
  }

  // Run the ingestion pipeline (reusing F1-S02 ingestBuffer)
  let result;
  try {
    result = await ingestBuffer({
      tenant,
      buffer,
      fileName,
      embedFn: async (texts) => (await generateEmbeddings(texts)).vectors,
    });
  } catch (err) {
    routeLog.error(
      { tenantSlug, err: err instanceof Error ? err.message : String(err) },
      "documents_upload_ingest_error",
    );
    return NextResponse.json(
      { error: "Erro interno durante a ingestão do documento" },
      { status: 500, headers: corsHeaders },
    );
  }

  const latencyMs = Date.now() - startMs;

  routeLog.info(
    {
      tenantSlug,
      fileName,
      bytesIn,
      status: result.status,
      latencyMs,
      chunks: result.chunks ?? null,
      documentId: result.documentId ?? null,
    },
    "documents_upload_complete",
  );

  return NextResponse.json(
    {
      documentId: result.documentId ?? null,
      status: result.status,
      chunks: result.chunks,
      error: result.status === "failed" ? (result.reason ?? "unknown") : undefined,
    },
    { status: 200, headers: corsHeaders },
  );
}

// ---------------------------------------------------------------------------
// GET /api/documents
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (origin && !isOriginAllowed(origin)) {
    return NextResponse.json(
      { error: "Origin not allowed" },
      { status: 403, headers: corsHeaders },
    );
  }

  const routeLog = logger.child({ route: "documents", method: "GET" });

  const { searchParams } = new URL(req.url);

  const rawQuery = {
    tenant: searchParams.get("tenant") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  };

  const queryParsed = GetQuerySchema.safeParse(rawQuery);
  if (!queryParsed.success) {
    return NextResponse.json(
      {
        error: "Query inválida",
        issues: queryParsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400, headers: corsHeaders },
    );
  }

  const { tenant: tenantSlug, limit, cursor: rawCursor } = queryParsed.data;

  // Resolve tenant — never accept tenant_id directly from the client
  let tenant;
  try {
    tenant = await getOrCreateTenant(tenantSlug);
  } catch (err) {
    if (err instanceof TenantNotFoundError) {
      return NextResponse.json(
        { error: "Tenant não encontrado" },
        { status: 404, headers: corsHeaders },
      );
    }
    routeLog.error(
      { tenantSlug, err: err instanceof Error ? err.message : String(err) },
      "documents_list_tenant_resolve_error",
    );
    return NextResponse.json(
      { error: "Erro interno ao resolver tenant" },
      { status: 500, headers: corsHeaders },
    );
  }

  // Decode cursor (if provided)
  let cursorPayload: CursorPayload | undefined;
  if (rawCursor !== undefined) {
    try {
      cursorPayload = decodeCursor(rawCursor);
    } catch {
      return NextResponse.json(
        { error: "Cursor inválido" },
        { status: 400, headers: corsHeaders },
      );
    }
  }

  try {
    // We fetch limit+1 to determine if there is a next page.
    // Ordering is createdAt DESC, id DESC for stable cursor-based pagination.
    const { and, lt, or, sql: drizzleSql } = await import("drizzle-orm");

    const baseFilter = eq(documents.tenantId, tenant.id);

    let rows;
    if (cursorPayload) {
      const { createdAt: cursorCreatedAt, id: cursorId } = cursorPayload;
      // Items with createdAt < cursor.createdAt OR (same createdAt AND id < cursor.id)
      const cursorFilter = or(
        lt(documents.createdAt, new Date(cursorCreatedAt)),
        and(
          drizzleSql`${documents.createdAt} = ${new Date(cursorCreatedAt)}`,
          lt(documents.id, cursorId),
        ),
      );
      rows = await db
        .select({
          id: documents.id,
          fileName: documents.fileName,
          mimeType: documents.mimeType,
          status: documents.status,
          error: documents.error,
          processedAt: documents.processedAt,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(and(baseFilter, cursorFilter))
        .orderBy(desc(documents.createdAt), desc(documents.id))
        .limit(limit + 1);
    } else {
      rows = await db
        .select({
          id: documents.id,
          fileName: documents.fileName,
          mimeType: documents.mimeType,
          status: documents.status,
          error: documents.error,
          processedAt: documents.processedAt,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(baseFilter)
        .orderBy(desc(documents.createdAt), desc(documents.id))
        .limit(limit + 1);
    }

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;

    const lastItem = items[items.length - 1];
    const nextCursor =
      hasNextPage && lastItem
        ? encodeCursor(lastItem.createdAt, lastItem.id)
        : null;

    return NextResponse.json(
      {
        items: items.map((row) => ({
          id: row.id,
          fileName: row.fileName,
          mimeType: row.mimeType,
          status: row.status,
          error: row.error,
          processedAt: row.processedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
        nextCursor,
      },
      { status: 200, headers: corsHeaders },
    );
  } catch (err) {
    routeLog.error(
      { tenantSlug, err: err instanceof Error ? err.message : String(err) },
      "documents_list_error",
    );
    return NextResponse.json(
      { error: "Erro interno ao listar documentos" },
      { status: 500, headers: corsHeaders },
    );
  }
}
