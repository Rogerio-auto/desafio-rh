import "../helpers/test-env";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Tenant } from "@/server/db/schema";

/**
 * Tests for `ingestBuffer` — the core, filesystem-free ingestion pipeline.
 *
 * All external I/O is stubbed:
 *  - `@/server/db/client` → in-memory document + chunk stores
 *  - `@/server/rag/chunker` → deterministic fake chunks
 *
 * `embedFn` is always injected, so no real OpenAI calls are made.
 */

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function makeTenant(slug: string): Tenant {
  return {
    id: randomUUID(),
    slug,
    name: slug,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const FAKE_VECTOR = Array<number>(1536).fill(0.01);

function fakeEmbedFn(texts: string[]): Promise<number[][]> {
  return Promise.resolve(texts.map(() => [...FAKE_VECTOR]));
}

// ---------------------------------------------------------------------------
// In-memory DB state shared across mocks within each test
// ---------------------------------------------------------------------------

interface MockDoc {
  id: string;
  tenantId: string;
  contentHash: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  status: string;
  error: string | null;
  processedAt: Date | null;
}

interface MockChunk {
  id: string;
  tenantId: string;
  documentId: string;
}

function createMockDb() {
  const storedDocs: MockDoc[] = [];
  const storedChunks: MockChunk[] = [];

  const db = {
    _docs: storedDocs,
    _chunks: storedChunks,

    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(function (this: typeof db) {
      // Returns the current query chain; actual value resolved in .limit()
      return this;
    }),
    limit: vi.fn().mockImplementation(function () {
      // Intercept at select().from().where().limit() — the dedup check
      // We expose a hook so individual tests can override return values
      return db._limitResult;
    }),

    _limitResult: Promise.resolve([] as Array<{ id: string }>),

    transaction: vi.fn().mockImplementation(async (fn: (tx: typeof db) => Promise<void>) => {
      await fn(db);
    }),

    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockImplementation(function (
      valOrArr: MockDoc | MockDoc[] | MockChunk | MockChunk[],
    ) {
      return {
        returning: vi.fn().mockImplementation((_fields: unknown) => {
          // Determine if this is a document or chunk insert by checking properties
          const first = Array.isArray(valOrArr) ? valOrArr[0] : valOrArr;
          if (first && "contentHash" in first) {
            const docs = Array.isArray(valOrArr) ? valOrArr : [valOrArr];
            const inserted = (docs as MockDoc[]).map((d) => {
              const id = randomUUID();
              storedDocs.push({ ...d, id });
              return { id };
            });
            return Promise.resolve(inserted);
          }
          // chunk insert — no returning needed
          const chunks = Array.isArray(valOrArr) ? valOrArr : [valOrArr];
          (chunks as MockChunk[]).forEach((c) => {
            storedChunks.push({ id: randomUUID(), tenantId: c.tenantId ?? "", documentId: (c as MockChunk).documentId ?? "" });
          });
          return Promise.resolve([]);
        }),
      };
    }),

    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };

  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ingestBuffer", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("ingests a valid buffer, returning status=ingested and documentId", async () => {
    const mockDb = createMockDb();
    // No existing doc → dedup check returns empty
    mockDb._limitResult = Promise.resolve([]);

    vi.doMock("@/server/db/client", () => ({ db: mockDb }));
    vi.doMock("@/server/rag/chunker", () => ({
      chunkText: vi.fn().mockReturnValue([
        { index: 0, content: "chunk one", tokenCount: 3 },
      ]),
    }));

    const { ingestBuffer } = await import("@/server/ingest/ingestor");
    const tenant = makeTenant("norteverde");
    const buffer = Buffer.from("Política de férias da NorteVerde.", "utf8");

    const result = await ingestBuffer({ tenant, buffer, fileName: "politica.txt", embedFn: fakeEmbedFn });

    expect(result.status).toBe("ingested");
    expect(result.documentId).toBeDefined();
    expect(result.chunks).toBe(1);
  });

  it("returns skipped_duplicate when same (tenant, hash) already exists", async () => {
    const existingId = randomUUID();
    const mockDb = createMockDb();
    // Dedup check finds existing row
    mockDb._limitResult = Promise.resolve([{ id: existingId }]);

    const embedSpy = vi.fn();
    vi.doMock("@/server/db/client", () => ({ db: mockDb }));

    const { ingestBuffer } = await import("@/server/ingest/ingestor");
    const tenant = makeTenant("norteverde");
    const buffer = Buffer.from("Política de férias da NorteVerde.", "utf8");

    const first = await ingestBuffer({ tenant, buffer, fileName: "politica.txt", embedFn: embedSpy });

    expect(first.status).toBe("skipped_duplicate");
    // No embedding should have been generated
    expect(embedSpy).not.toHaveBeenCalled();
  });

  it("second call with the same (tenant, buffer) returns skipped_duplicate without embedding", async () => {
    let callCount = 0;
    // First call: no doc exists → ingested. Second call: doc exists → skipped.
    const storedId = randomUUID();

    const mockDb = createMockDb();
    mockDb.limit.mockImplementation(function () {
      if (callCount === 0) {
        callCount++;
        return Promise.resolve([]);
      }
      return Promise.resolve([{ id: storedId }]);
    });

    const embedCallCount = { n: 0 };
    const countingEmbedFn = (texts: string[]) => {
      embedCallCount.n++;
      return fakeEmbedFn(texts);
    };

    vi.doMock("@/server/db/client", () => ({ db: mockDb }));
    vi.doMock("@/server/rag/chunker", () => ({
      chunkText: vi.fn().mockReturnValue([
        { index: 0, content: "chunk one", tokenCount: 3 },
      ]),
    }));

    const { ingestBuffer } = await import("@/server/ingest/ingestor");
    const tenant = makeTenant("norteverde");
    const buffer = Buffer.from("Política de férias da NorteVerde.", "utf8");

    const first = await ingestBuffer({ tenant, buffer, fileName: "politica.txt", embedFn: countingEmbedFn });
    const second = await ingestBuffer({ tenant, buffer, fileName: "politica.txt", embedFn: countingEmbedFn });

    expect(first.status).toBe("ingested");
    expect(second.status).toBe("skipped_duplicate");
    // Embedding was called only once (for the first ingestion)
    expect(embedCallCount.n).toBe(1);
  });

  it("allows same buffer for two different tenants — no cross-tenant dedup", async () => {
    const buffer = Buffer.from("Conteúdo compartilhado entre empresas.", "utf8");

    let tenantAChecked = false;

    const mockDb = createMockDb();
    // Both tenants get empty dedup result (independent uniqueness per tenant)
    mockDb.limit.mockImplementation(function () {
      if (!tenantAChecked) {
        tenantAChecked = true;
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    vi.doMock("@/server/db/client", () => ({ db: mockDb }));
    vi.doMock("@/server/rag/chunker", () => ({
      chunkText: vi.fn().mockReturnValue([
        { index: 0, content: "chunk shared", tokenCount: 3 },
      ]),
    }));

    const { ingestBuffer } = await import("@/server/ingest/ingestor");
    const tenantA = makeTenant("norteverde");
    const tenantB = makeTenant("aurora");

    const resA = await ingestBuffer({ tenant: tenantA, buffer, fileName: "shared.txt", embedFn: fakeEmbedFn });
    const resB = await ingestBuffer({ tenant: tenantB, buffer, fileName: "shared.txt", embedFn: fakeEmbedFn });

    expect(resA.status).toBe("ingested");
    expect(resB.status).toBe("ingested");
    // Both tenants got independent documents
    expect(resA.documentId).toBeDefined();
    expect(resB.documentId).toBeDefined();
    expect(resA.documentId).not.toBe(resB.documentId);
  });

  it("returns failed with reason=empty_extracted_text for a whitespace-only buffer", async () => {
    const mockDb = createMockDb();
    mockDb._limitResult = Promise.resolve([]);

    vi.doMock("@/server/db/client", () => ({ db: mockDb }));

    const { ingestBuffer } = await import("@/server/ingest/ingestor");
    const tenant = makeTenant("norteverde");
    // A text file with only whitespace → extractTextFromBuffer returns only whitespace
    const buffer = Buffer.from("   \n\t  ", "utf8");

    const result = await ingestBuffer({ tenant, buffer, fileName: "empty.txt", embedFn: fakeEmbedFn });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("empty_extracted_text");
  });

  it("returns failed with reason=unsupported_extension for unknown extension", async () => {
    const mockDb = createMockDb();
    vi.doMock("@/server/db/client", () => ({ db: mockDb }));

    const { ingestBuffer } = await import("@/server/ingest/ingestor");
    const tenant = makeTenant("norteverde");
    const buffer = Buffer.from("any content", "utf8");

    const result = await ingestBuffer({ tenant, buffer, fileName: "arquivo.exe", embedFn: fakeEmbedFn });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("unsupported_extension");
  });

  it("includes documentId in the result when ingestion succeeds", async () => {
    const mockDb = createMockDb();
    mockDb._limitResult = Promise.resolve([]);

    vi.doMock("@/server/db/client", () => ({ db: mockDb }));
    vi.doMock("@/server/rag/chunker", () => ({
      chunkText: vi.fn().mockReturnValue([
        { index: 0, content: "texto", tokenCount: 2 },
      ]),
    }));

    const { ingestBuffer } = await import("@/server/ingest/ingestor");
    const tenant = makeTenant("vitalys");
    const buffer = Buffer.from("Documento de RH da Vitalys.", "utf8");

    const result = await ingestBuffer({ tenant, buffer, fileName: "rh.txt", embedFn: fakeEmbedFn });

    expect(result.status).toBe("ingested");
    expect(typeof result.documentId).toBe("string");
    expect(result.documentId!.length).toBeGreaterThan(0);
  });
});
