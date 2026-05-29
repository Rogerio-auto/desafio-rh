import { randomUUID } from "node:crypto";

/**
 * A tiny in-memory store that mirrors the parts of the schema the tests
 * exercise. It exists so we can prove tenant isolation and end-to-end chat
 * behavior without spinning up a real Postgres + pgvector in the test runner.
 *
 * Test code talks to this store via the same higher-level functions that
 * production talks to via Drizzle — the modules under test are wired with
 * dependency injection in the helpers below.
 */
export interface InMemoryTenant {
  id: string;
  slug: string;
  name: string;
}

export interface InMemoryDocument {
  id: string;
  tenantId: string;
  fileName: string;
  contentHash: string;
}

export interface InMemoryChunk {
  id: string;
  tenantId: string;
  documentId: string;
  fileName: string;
  content: string;
  embedding: number[];
}

export class InMemoryStore {
  tenants: InMemoryTenant[] = [];
  documents: InMemoryDocument[] = [];
  chunks: InMemoryChunk[] = [];

  addTenant(slug: string, name: string): InMemoryTenant {
    const existing = this.tenants.find((t) => t.slug === slug);
    if (existing) return existing;
    const t: InMemoryTenant = { id: randomUUID(), slug, name };
    this.tenants.push(t);
    return t;
  }

  addDocument(tenantId: string, fileName: string, contentHash: string) {
    const existing = this.documents.find(
      (d) => d.tenantId === tenantId && d.contentHash === contentHash,
    );
    if (existing) return { document: existing, created: false };
    const doc: InMemoryDocument = {
      id: randomUUID(),
      tenantId,
      fileName,
      contentHash,
    };
    this.documents.push(doc);
    return { document: doc, created: true };
  }

  addChunk(input: Omit<InMemoryChunk, "id">) {
    const chunk: InMemoryChunk = { id: randomUUID(), ...input };
    this.chunks.push(chunk);
    return chunk;
  }
}
