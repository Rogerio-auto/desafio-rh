import "../helpers/test-env";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/server/ingest/hash";
import { InMemoryStore } from "../helpers/in-memory-store";

/**
 * The production code enforces idempotency at two layers:
 *  - a UNIQUE (tenant_id, content_hash) index on `documents`
 *  - a pre-insert SELECT that skips embedding when the hash already exists
 *
 * The in-memory store mimics both layers so we can prove the contract here
 * without needing a live database. The same contract is exercised end-to-end
 * by `chat-isolation.test.ts` against the production tenant filter.
 */
describe("ingestion idempotency", () => {
  it("addDocument never duplicates the same (tenant, hash) pair", () => {
    const store = new InMemoryStore();
    const tenant = store.addTenant("norteverde", "NorteVerde");

    const buffer = Buffer.from("Política de férias - versão 2", "utf8");
    const hash = sha256Hex(buffer);

    const first = store.addDocument(tenant.id, "politica.docx", hash);
    const second = store.addDocument(tenant.id, "politica.docx", hash);
    const third = store.addDocument(tenant.id, "politica.docx", hash);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(store.documents.length).toBe(1);
  });

  it("allows the same hash across different tenants (no cross-tenant dedup)", () => {
    const store = new InMemoryStore();
    const a = store.addTenant("norteverde", "NorteVerde");
    const b = store.addTenant("aurora", "Aurora");

    const hash = sha256Hex("shared content");
    const x = store.addDocument(a.id, "shared.txt", hash);
    const y = store.addDocument(b.id, "shared.txt", hash);

    expect(x.created).toBe(true);
    expect(y.created).toBe(true);
    expect(store.documents.length).toBe(2);
  });

  it("produces stable hashes for identical content", () => {
    expect(sha256Hex("Política de férias")).toBe(sha256Hex("Política de férias"));
    expect(sha256Hex("Política de férias")).not.toBe(sha256Hex("politica de ferias"));
  });
});
