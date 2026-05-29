import { getEnv } from "@/lib/env";
import { getAiClient } from "./client";

export interface EmbeddingResult {
  vectors: number[][];
  inputTokens: number;
}

/**
 * Generate embeddings for an array of input strings using the configured
 * embedding model. Batches are sent in a single API call when possible — the
 * OpenAI Embeddings endpoint accepts up to ~2048 inputs per request, but we
 * cap at 96 to stay well within per-provider limits.
 */
export async function generateEmbeddings(
  inputs: string[],
): Promise<EmbeddingResult> {
  if (inputs.length === 0) {
    return { vectors: [], inputTokens: 0 };
  }
  const env = getEnv();
  const client = getAiClient();
  const BATCH_SIZE = 96;
  const vectors: number[][] = [];
  let inputTokens = 0;

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    const res = await client.embeddings.create({
      model: env.EMBEDDING_MODEL,
      input: batch,
    });
    for (const item of res.data) {
      vectors.push(item.embedding as number[]);
    }
    inputTokens += res.usage?.prompt_tokens ?? 0;
  }
  return { vectors, inputTokens };
}

export async function generateQueryEmbedding(query: string): Promise<{
  vector: number[];
  inputTokens: number;
}> {
  const { vectors, inputTokens } = await generateEmbeddings([query]);
  const vector = vectors[0];
  if (!vector) {
    throw new Error("Embedding provider returned an empty response");
  }
  return { vector, inputTokens };
}
