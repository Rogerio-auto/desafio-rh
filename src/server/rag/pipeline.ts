import { db } from "@/server/db/client";
import { chatInteractions } from "@/server/db/schema";
import { getEnv } from "@/lib/env";
import { generateChatCompletion, type ContextChunk } from "@/server/ai/chat";
import { generateQueryEmbedding } from "@/server/ai/embeddings";
import { estimateCostUsd } from "@/server/ai/cost";
import { logger } from "@/server/logging/logger";
import { resolveTenant, TenantNotFoundError } from "@/server/tenants/service";
import { retrieveChunks, type RetrievedChunk } from "./retriever";

export interface ChatSource {
  fileName: string;
  chunkId: string;
  similarity: number;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  latencyMs: number;
  estimatedCostUsd: number;
  retrievedCount: number;
}

export class ChatPipelineError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ChatPipelineError";
    this.statusCode = statusCode;
  }
}

export async function runChat(params: {
  tenantSlug: string;
  question: string;
}): Promise<ChatResponse> {
  const env = getEnv();
  const startedAt = Date.now();
  const log = logger.child({ tenant: params.tenantSlug });

  try {
    const tenant = await resolveTenant(params.tenantSlug);

    const { vector: queryEmbedding, inputTokens: embeddingTokens } =
      await generateQueryEmbedding(params.question);

    const retrieved = await retrieveChunks({
      tenant,
      queryEmbedding,
    });

    const trimmed = trimContextToBudget(retrieved, env.MAX_CONTEXT_CHARS);
    const contextChunks: ContextChunk[] = trimmed.map((c) => ({
      fileName: c.fileName,
      content: c.content,
    }));

    const { answer, inputTokens, outputTokens } = await generateChatCompletion(
      params.question,
      contextChunks,
    );

    const cost = estimateCostUsd({
      embeddingTokens,
      inputTokens,
      outputTokens,
    });

    const sources: ChatSource[] = trimmed.map((c) => ({
      fileName: c.fileName,
      chunkId: c.chunkId,
      similarity: Number(c.similarity.toFixed(4)),
    }));

    const latencyMs = Date.now() - startedAt;

    await db.insert(chatInteractions).values({
      tenantId: tenant.id,
      question: params.question,
      answer,
      sources,
      latencyMs,
      estimatedCostUsd: cost.totalUsd.toString(),
      status: "success",
    });

    log.info(
      {
        question: params.question,
        documentsRetrieved: Array.from(new Set(sources.map((s) => s.fileName))),
        retrievedChunks: trimmed.length,
        latencyMs,
        estimatedCostUsd: cost.totalUsd,
        status: "success",
      },
      "chat_interaction",
    );

    return {
      answer,
      sources,
      latencyMs,
      estimatedCostUsd: cost.totalUsd,
      retrievedCount: trimmed.length,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      {
        question: params.question,
        documentsRetrieved: [],
        latencyMs,
        estimatedCostUsd: 0,
        status: "error",
        error: message,
      },
      "chat_interaction",
    );
    if (err instanceof TenantNotFoundError) {
      throw new ChatPipelineError(err.message, 404);
    }
    if (err instanceof ChatPipelineError) throw err;
    throw new ChatPipelineError("Internal error processing chat", 500);
  }
}

function trimContextToBudget(
  chunks: RetrievedChunk[],
  maxChars: number,
): RetrievedChunk[] {
  const out: RetrievedChunk[] = [];
  let used = 0;
  for (const c of chunks) {
    const cost = c.content.length + 80;
    if (used + cost > maxChars) break;
    out.push(c);
    used += cost;
  }
  return out;
}
