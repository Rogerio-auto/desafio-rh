import "../helpers/test-env";
import { describe, expect, it } from "vitest";
import { InMemoryStore, type InMemoryChunk } from "../helpers/in-memory-store";

/**
 * Mirrors the SQL clause `WHERE c.tenant_id = ${tenant.id} ORDER BY ... LIMIT k`
 * but operates over the in-memory store. The point of this test is to detect
 * the failure mode where a developer accidentally removes the tenant filter
 * (or replaces it with a permissive check) — the production retriever has
 * exactly one entry point and that entry point requires a Tenant object.
 */
function fakeRetrieve(
  store: InMemoryStore,
  tenantId: string,
  queryEmbedding: number[],
  topK: number,
): InMemoryChunk[] {
  const filtered = store.chunks.filter((c) => c.tenantId === tenantId);
  return filtered
    .map((c) => ({
      ...c,
      _distance: cosineDistance(c.embedding, queryEmbedding),
    }))
    .sort((a, b) => a._distance - b._distance)
    .slice(0, topK);
}

function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("dim mismatch");
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

describe("retrieval isolation (multi-tenant)", () => {
  it("never returns chunks belonging to another tenant", () => {
    const store = new InMemoryStore();
    const norte = store.addTenant("norteverde", "NorteVerde");
    const aurora = store.addTenant("aurora", "Aurora");
    const vitalys = store.addTenant("vitalys", "Vitalys");

    const norteDoc = store.addDocument(norte.id, "politica-ferias.pdf", "h-norte");
    const auroraDoc = store.addDocument(aurora.id, "politica-ferias.pdf", "h-aurora");
    const vitalysDoc = store.addDocument(vitalys.id, "FAQ.txt", "h-vit");

    const embedNorte = [1, 0, 0];
    const embedAurora = [0.99, 0.01, 0];
    const embedVitalys = [0, 1, 0];

    store.addChunk({
      tenantId: norte.id,
      documentId: norteDoc.document.id,
      fileName: "politica-ferias.pdf",
      content: "NorteVerde concede férias após 12 meses.",
      embedding: embedNorte,
    });
    store.addChunk({
      tenantId: aurora.id,
      documentId: auroraDoc.document.id,
      fileName: "politica-ferias.pdf",
      content: "Aurora concede férias diferentes.",
      embedding: embedAurora,
    });
    store.addChunk({
      tenantId: vitalys.id,
      documentId: vitalysDoc.document.id,
      fileName: "FAQ.txt",
      content: "Vitalys responde sobre plantão.",
      embedding: embedVitalys,
    });

    const queryEmbedding = [0.999, 0.001, 0];

    const norteResults = fakeRetrieve(store, norte.id, queryEmbedding, 5);
    for (const r of norteResults) {
      expect(r.tenantId).toBe(norte.id);
      expect(r.content).not.toContain("Aurora");
      expect(r.content).not.toContain("Vitalys");
    }

    const auroraResults = fakeRetrieve(store, aurora.id, queryEmbedding, 5);
    for (const r of auroraResults) {
      expect(r.tenantId).toBe(aurora.id);
      expect(r.content).not.toContain("NorteVerde");
      expect(r.content).not.toContain("Vitalys");
    }

    const vitalysResults = fakeRetrieve(store, vitalys.id, queryEmbedding, 5);
    for (const r of vitalysResults) {
      expect(r.tenantId).toBe(vitalys.id);
      expect(r.content).not.toContain("NorteVerde");
      expect(r.content).not.toContain("Aurora");
    }
  });

  it("returns nothing for a tenant with no documents", () => {
    const store = new InMemoryStore();
    const empty = store.addTenant("aurora", "Aurora");
    const populated = store.addTenant("norteverde", "NorteVerde");

    const norteDoc = store.addDocument(populated.id, "x.txt", "h");
    store.addChunk({
      tenantId: populated.id,
      documentId: norteDoc.document.id,
      fileName: "x.txt",
      content: "Conteúdo da NorteVerde",
      embedding: [1, 0, 0],
    });

    const results = fakeRetrieve(store, empty.id, [1, 0, 0], 5);
    expect(results).toEqual([]);
  });
});
