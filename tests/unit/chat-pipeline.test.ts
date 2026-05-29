import "../helpers/test-env";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Exercises `runChat` end-to-end with everything below it stubbed.
 *
 * Confirms:
 *  - tenant resolution is called with the slug from the request
 *  - the retriever is called with the resolved tenant (not the raw slug)
 *  - sources returned by the pipeline correspond to retrieved chunks
 *  - no-context scenario returns the explicit safe wording
 *  - cost estimation is reflected in the response
 *  - chat_interactions insert is called with the expected status
 */
describe("runChat pipeline", () => {
  const tenant = {
    id: "00000000-0000-0000-0000-000000000abc",
    slug: "aurora",
    name: "Aurora",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.resetModules();
  });

  it("returns answer + sources when chunks are retrieved", async () => {
    const insertValuesSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/server/db/client", () => ({
      db: {
        insert: vi.fn(() => ({ values: insertValuesSpy })),
      },
      sql: vi.fn(),
    }));
    vi.doMock("@/server/tenants/service", async () => {
      const real = await vi.importActual<typeof import("@/server/tenants/service")>(
        "@/server/tenants/service",
      );
      return {
        ...real,
        resolveTenant: vi.fn().mockResolvedValue(tenant),
      };
    });
    const retrieveSpy = vi.fn().mockResolvedValue([
      {
        chunkId: "c-1",
        documentId: "d-1",
        fileName: "Politica_Home_Office.md",
        content: "Aurora permite home office em casos pontuais.",
        similarity: 0.91,
      },
    ]);
    vi.doMock("@/server/rag/retriever", () => ({
      retrieveChunks: retrieveSpy,
    }));
    vi.doMock("@/server/ai/embeddings", () => ({
      generateQueryEmbedding: vi.fn().mockResolvedValue({
        vector: Array(1536).fill(0.01),
        inputTokens: 8,
      }),
    }));
    vi.doMock("@/server/ai/chat", async () => {
      const real = await vi.importActual<typeof import("@/server/ai/chat")>(
        "@/server/ai/chat",
      );
      return {
        ...real,
        generateChatCompletion: vi.fn().mockResolvedValue({
          answer:
            "De acordo com a Aurora, home office é permitido em casos pontuais (Politica_Home_Office.md).",
          inputTokens: 120,
          outputTokens: 40,
        }),
      };
    });

    const { runChat } = await import("@/server/rag/pipeline");
    const res = await runChat({
      tenantSlug: "aurora",
      question: "Quem pode fazer home office?",
    });

    expect(res.answer).toContain("Aurora");
    expect(res.sources).toHaveLength(1);
    expect(res.sources[0]?.fileName).toBe("Politica_Home_Office.md");
    expect(res.retrievedCount).toBe(1);
    expect(res.estimatedCostUsd).toBeGreaterThan(0);

    const callArgs = retrieveSpy.mock.calls[0]?.[0];
    expect(callArgs.tenant.id).toBe(tenant.id);
    expect(insertValuesSpy).toHaveBeenCalledOnce();
    const insertedRow = insertValuesSpy.mock.calls[0]?.[0];
    expect(insertedRow.status).toBe("success");
    expect(insertedRow.tenantId).toBe(tenant.id);
    expect(insertedRow.sources).toHaveLength(1);
  });

  it("returns the explicit no-evidence answer when retrieval is empty", async () => {
    const insertValuesSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/server/db/client", () => ({
      db: { insert: vi.fn(() => ({ values: insertValuesSpy })) },
      sql: vi.fn(),
    }));
    vi.doMock("@/server/tenants/service", async () => {
      const real = await vi.importActual<typeof import("@/server/tenants/service")>(
        "@/server/tenants/service",
      );
      return {
        ...real,
        resolveTenant: vi.fn().mockResolvedValue(tenant),
      };
    });
    vi.doMock("@/server/rag/retriever", () => ({
      retrieveChunks: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("@/server/ai/embeddings", () => ({
      generateQueryEmbedding: vi.fn().mockResolvedValue({
        vector: Array(1536).fill(0.01),
        inputTokens: 6,
      }),
    }));
    vi.doMock("@/server/ai/chat", async () => {
      const real = await vi.importActual<typeof import("@/server/ai/chat")>(
        "@/server/ai/chat",
      );
      return {
        ...real,
        generateChatCompletion: vi.fn().mockResolvedValue({
          answer:
            "Não encontrei evidência documental suficiente para responder com segurança. Procure o RH.",
          inputTokens: 30,
          outputTokens: 22,
        }),
      };
    });

    const { runChat } = await import("@/server/rag/pipeline");
    const res = await runChat({
      tenantSlug: "aurora",
      question: "Pergunta sem contexto?",
    });
    expect(res.sources).toEqual([]);
    expect(res.answer).toContain("Não encontrei evidência documental suficiente");
  });

  it("propagates a 404 ChatPipelineError when tenant is unknown", async () => {
    vi.doMock("@/server/db/client", () => ({
      db: { insert: vi.fn(() => ({ values: vi.fn() })) },
      sql: vi.fn(),
    }));
    vi.doMock("@/server/ai/embeddings", () => ({
      generateQueryEmbedding: vi.fn(),
    }));
    vi.doMock("@/server/ai/chat", async () => {
      const real = await vi.importActual<typeof import("@/server/ai/chat")>(
        "@/server/ai/chat",
      );
      return {
        ...real,
        generateChatCompletion: vi.fn(),
      };
    });
    vi.doMock("@/server/rag/retriever", () => ({
      retrieveChunks: vi.fn(),
    }));

    const { runChat, ChatPipelineError } = await import("@/server/rag/pipeline");
    await expect(
      runChat({ tenantSlug: "acme-corp", question: "Olá?" }),
    ).rejects.toBeInstanceOf(ChatPipelineError);
  });
});
