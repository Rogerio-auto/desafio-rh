import "../helpers/test-env";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { IngestFileResult } from "@/server/ingest/ingestor";
import type { Tenant } from "@/server/db/schema";

/**
 * Unit tests for POST /api/documents and GET /api/documents.
 *
 * All external I/O (DB, ingestBuffer, getOrCreateTenant, generateEmbeddings)
 * is stubbed via vi.doMock + vi.resetModules per test to keep them isolated.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTenant(slug = "norteverde"): Tenant {
  return {
    id: randomUUID(),
    slug,
    name: slug,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Build a multipart FormData body for POST requests.
 * Uses a real File so Next.js formData() can parse it.
 */
function makeFormData(fields: {
  tenant?: string;
  fileName?: string;
  content?: string;
  contentType?: string;
}): FormData {
  const form = new FormData();
  if (fields.tenant !== undefined) form.set("tenant", fields.tenant);
  if (fields.fileName !== undefined) {
    const file = new File(
      [fields.content ?? "content de teste"],
      fields.fileName,
      { type: fields.contentType ?? "text/plain" },
    );
    form.set("file", file);
  }
  return form;
}

/** Build a NextRequest with multipart FormData. */
async function makePostRequest(opts: {
  origin?: string;
  tenant?: string;
  fileName?: string;
  content?: string;
  contentType?: string;
  contentLength?: number;
}): Promise<NextRequest> {
  const formData = makeFormData({
    tenant: opts.tenant,
    fileName: opts.fileName,
    content: opts.content,
    contentType: opts.contentType,
  });

  const body = new Request("http://localhost:3000/api/documents", {
    method: "POST",
    body: formData,
  });

  const headers: Record<string, string> = {};
  if (opts.origin) headers["origin"] = opts.origin;
  if (opts.contentLength !== undefined) {
    headers["content-length"] = String(opts.contentLength);
  }

  return new NextRequest("http://localhost:3000/api/documents", {
    method: "POST",
    body: await body.blob(),
    headers: {
      ...Object.fromEntries(body.headers.entries()),
      ...headers,
    },
  });
}

/** Build a NextRequest for GET with query params. */
function makeGetRequest(
  params: Record<string, string>,
  origin?: string,
): NextRequest {
  const url = new URL("http://localhost:3000/api/documents");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (origin) headers["origin"] = origin;
  return new NextRequest(url.toString(), { method: "GET", headers });
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeIngestResult(
  partial: Partial<IngestFileResult> = {},
): IngestFileResult {
  return {
    fileName: "doc.txt",
    filePath: "",
    status: "ingested",
    chunks: 3,
    documentId: randomUUID(),
    ...partial,
  };
}

/**
 * Build a minimal Drizzle-shaped mock for list queries.
 * Returns empty array by default; override with `rows`.
 */
function makeDbMock(rows: unknown[] = []) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("POST /api/documents", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 403 when origin is not allowed", async () => {
    const { POST } = await import("@/app/api/documents/route");
    const req = await makePostRequest({ origin: "https://evil.example", tenant: "norteverde", fileName: "a.txt" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/origin/i);
  });

  it("returns 400 when tenant field is missing", async () => {
    const { POST } = await import("@/app/api/documents/route");
    const req = await makePostRequest({ fileName: "a.txt" }); // no tenant
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { issues: Array<{ path: string }> };
    expect(body.issues[0]?.path).toBe("tenant");
  });

  it("returns 400 when file field is missing", async () => {
    const { POST } = await import("@/app/api/documents/route");
    // Build request with tenant but no file
    const formData = new FormData();
    formData.set("tenant", "norteverde");
    const raw = new Request("http://localhost:3000/api/documents", {
      method: "POST",
      body: formData,
    });
    const req = new NextRequest("http://localhost:3000/api/documents", {
      method: "POST",
      body: await raw.blob(),
      headers: Object.fromEntries(raw.headers.entries()),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { issues: Array<{ path: string }> };
    expect(body.issues[0]?.path).toBe("file");
  });

  it("returns 404 when tenant slug is unknown", async () => {
    // We need the mock set before any import of the route module.
    // Use a class that satisfies the instanceof check in the route.
    class MockTenantNotFoundError extends Error {
      constructor(slug: string) {
        super(`Tenant not found: ${slug}`);
        this.name = "TenantNotFoundError";
      }
    }

    vi.doMock("@/server/tenants/service", () => ({
      TenantNotFoundError: MockTenantNotFoundError,
      getOrCreateTenant: vi.fn().mockRejectedValue(
        new MockTenantNotFoundError("norteverde"),
      ),
    }));

    const { POST } = await import("@/app/api/documents/route");
    const req = await makePostRequest({ tenant: "norteverde", fileName: "a.txt" });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 413 when content-length header exceeds max", async () => {
    const { POST } = await import("@/app/api/documents/route");
    // MAX_UPLOAD_SIZE_MB defaults to 10 in test-env (not set), so default is 10MB = 10485760 bytes
    const req = await makePostRequest({
      tenant: "norteverde",
      fileName: "big.txt",
      contentLength: 20 * 1024 * 1024, // 20 MB
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("returns 415 when file extension is not supported", async () => {
    vi.doMock("@/server/tenants/service", () => ({
      TenantNotFoundError: class TenantNotFoundError extends Error {},
      getOrCreateTenant: vi.fn().mockResolvedValue(makeTenant()),
    }));

    const { POST } = await import("@/app/api/documents/route");
    const req = await makePostRequest({ tenant: "norteverde", fileName: "virus.exe", content: "MZ" });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });

  it("returns 200 with status=ingested on happy path", async () => {
    const tenant = makeTenant();
    const ingestResult = makeIngestResult();

    vi.doMock("@/server/tenants/service", () => ({
      TenantNotFoundError: class TenantNotFoundError extends Error {},
      getOrCreateTenant: vi.fn().mockResolvedValue(tenant),
    }));
    vi.doMock("@/server/ingest/ingestor", () => ({
      ingestBuffer: vi.fn().mockResolvedValue(ingestResult),
    }));
    vi.doMock("@/server/ai/embeddings", () => ({
      generateEmbeddings: vi.fn().mockResolvedValue({ vectors: [], inputTokens: 0 }),
    }));

    const { POST } = await import("@/app/api/documents/route");
    const req = await makePostRequest({
      tenant: "norteverde",
      fileName: "policy.txt",
      content: "Política de RH.",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      documentId: string;
      status: string;
      chunks: number;
    };
    expect(body.status).toBe("ingested");
    expect(body.documentId).toBe(ingestResult.documentId);
    expect(body.chunks).toBe(ingestResult.chunks);
  });

  it("returns 200 with status=skipped_duplicate on second upload of same content", async () => {
    const tenant = makeTenant();
    const duplicateResult = makeIngestResult({
      status: "skipped_duplicate",
      documentId: undefined,
      chunks: undefined,
    });

    vi.doMock("@/server/tenants/service", () => ({
      TenantNotFoundError: class TenantNotFoundError extends Error {},
      getOrCreateTenant: vi.fn().mockResolvedValue(tenant),
    }));
    vi.doMock("@/server/ingest/ingestor", () => ({
      ingestBuffer: vi.fn().mockResolvedValue(duplicateResult),
    }));
    vi.doMock("@/server/ai/embeddings", () => ({
      generateEmbeddings: vi.fn().mockResolvedValue({ vectors: [], inputTokens: 0 }),
    }));

    const { POST } = await import("@/app/api/documents/route");
    const req = await makePostRequest({
      tenant: "norteverde",
      fileName: "policy.txt",
      content: "Política de RH.",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; documentId: null };
    expect(body.status).toBe("skipped_duplicate");
    expect(body.documentId).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("GET /api/documents", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 400 when tenant query param is missing", async () => {
    const { GET } = await import("@/app/api/documents/route");
    const req = makeGetRequest({});
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { issues: Array<{ path: string }> };
    expect(body.issues.some((i) => i.path === "tenant")).toBe(true);
  });

  it("returns 400 when tenant slug is unknown (Zod rejects)", async () => {
    const { GET } = await import("@/app/api/documents/route");
    const req = makeGetRequest({ tenant: "not-a-real-tenant" });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when cursor is malformed base64", async () => {
    const tenant = makeTenant();
    vi.doMock("@/server/tenants/service", () => ({
      TenantNotFoundError: class TenantNotFoundError extends Error {},
      getOrCreateTenant: vi.fn().mockResolvedValue(tenant),
    }));

    const { GET } = await import("@/app/api/documents/route");
    const req = makeGetRequest({ tenant: "norteverde", cursor: "!!!invalid!!!" });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/cursor/i);
  });

  it("returns only docs belonging to the requested tenant (isolation)", async () => {
    const tenantA = makeTenant("norteverde");
    const tenantB = makeTenant("aurora");

    const docA = {
      id: randomUUID(),
      fileName: "a.txt",
      mimeType: "text/plain",
      status: "ready" as const,
      error: null,
      processedAt: null,
      createdAt: new Date(),
      tenantId: tenantA.id,
    };
    const docB = {
      id: randomUUID(),
      fileName: "b.txt",
      mimeType: "text/plain",
      status: "ready" as const,
      error: null,
      processedAt: null,
      createdAt: new Date(),
      tenantId: tenantB.id,
    };

    // tenantA request should only receive docA (the mock returns only docA's row)
    vi.doMock("@/server/tenants/service", () => ({
      TenantNotFoundError: class TenantNotFoundError extends Error {},
      getOrCreateTenant: vi.fn().mockResolvedValue(tenantA),
    }));
    vi.doMock("@/server/db/client", () => ({
      db: makeDbMock([docA]),
    }));

    const { GET } = await import("@/app/api/documents/route");
    const req = makeGetRequest({ tenant: "norteverde" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    // Only docA is returned — docB is absent
    expect(body.items.every((item) => item.id !== docB.id)).toBe(true);
    expect(body.items.some((item) => item.id === docA.id)).toBe(true);
  });

  it("returns 403 when origin is not allowed", async () => {
    const { GET } = await import("@/app/api/documents/route");
    const req = makeGetRequest({ tenant: "norteverde" }, "https://evil.example");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("paginates correctly with cursor: 3 docs, limit=2, second page has the third", async () => {
    const tenant = makeTenant("norteverde");

    // Three docs ordered by createdAt DESC
    const now = Date.now();
    const doc1 = {
      id: randomUUID(),
      fileName: "doc1.txt",
      mimeType: "text/plain",
      status: "ready" as const,
      error: null,
      processedAt: null,
      createdAt: new Date(now - 1000),
    };
    const doc2 = {
      id: randomUUID(),
      fileName: "doc2.txt",
      mimeType: "text/plain",
      status: "ready" as const,
      error: null,
      processedAt: null,
      createdAt: new Date(now - 2000),
    };
    const doc3 = {
      id: randomUUID(),
      fileName: "doc3.txt",
      mimeType: "text/plain",
      status: "ready" as const,
      error: null,
      processedAt: null,
      createdAt: new Date(now - 3000),
    };

    // First call (no cursor): returns doc1, doc2, doc3 (limit+1 = 3). We have 3 rows returned for limit=2.
    // Second call (with cursor pointing to doc2): returns doc3.
    let callCount = 0;
    const dbMock = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First page: return doc1, doc2, doc3 (limit+1 rows → hasNextPage=true)
          return Promise.resolve([doc1, doc2, doc3]);
        }
        // Second page (after cursor): return only doc3
        return Promise.resolve([doc3]);
      }),
    };

    vi.doMock("@/server/tenants/service", () => ({
      TenantNotFoundError: class TenantNotFoundError extends Error {},
      getOrCreateTenant: vi.fn().mockResolvedValue(tenant),
    }));
    vi.doMock("@/server/db/client", () => ({ db: dbMock }));

    const { GET } = await import("@/app/api/documents/route");

    // First page (limit=2)
    const req1 = makeGetRequest({ tenant: "norteverde", limit: "2" });
    const res1 = await GET(req1);
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(body1.items).toHaveLength(2);
    expect(body1.items[0]?.id).toBe(doc1.id);
    expect(body1.items[1]?.id).toBe(doc2.id);
    expect(body1.nextCursor).not.toBeNull();

    // Second page using nextCursor
    const req2 = makeGetRequest({
      tenant: "norteverde",
      limit: "2",
      cursor: body1.nextCursor!,
    });
    const res2 = await GET(req2);
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(body2.items).toHaveLength(1);
    expect(body2.items[0]?.id).toBe(doc3.id);
    expect(body2.nextCursor).toBeNull();
  });
});
