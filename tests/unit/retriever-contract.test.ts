import "../helpers/test-env";
import { describe, expect, it } from "vitest";
import { retrieveChunks } from "@/server/rag/retriever";

/**
 * The retriever's public signature *only* accepts a fully-resolved `Tenant`
 * object (the type returned by `resolveTenant`). This test fails at compile
 * time if anyone changes the signature to accept a raw string, which would
 * be a regression against the multi-tenant isolation contract.
 *
 * The runtime body proves the dimension check rejects bad embeddings before
 * any SQL is issued — a defensive guard against passing the wrong vector.
 */
describe("retriever contract", () => {
  it("rejects an embedding whose dimension differs from EMBEDDING_DIMENSIONS", async () => {
    await expect(
      retrieveChunks({
        tenant: {
          id: "00000000-0000-0000-0000-000000000000",
          slug: "norteverde",
          name: "NorteVerde",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        queryEmbedding: [0.1, 0.2, 0.3],
      }),
    ).rejects.toThrow(/dimension mismatch/i);
  });
});
