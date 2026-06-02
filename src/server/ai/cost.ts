import { getEnv } from "@/lib/env";

export interface CostBreakdown {
  embeddingTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
}

const PER_MILLION = 1_000_000;

/**
 * Estimate USD cost of one chat interaction. Prices come from the env so the
 * same code estimates correctly across OpenAI, OpenRouter, Azure, etc.
 *
 * Returns 0 (not NaN) when prices aren't configured — the env validation in
 * `lib/env.ts` already guarantees numeric values, so a 0 here means the
 * operator explicitly chose to disable estimation.
 */
export function estimateCostUsd(input: {
  embeddingTokens: number;
  inputTokens: number;
  outputTokens: number;
}): CostBreakdown {
  const env = getEnv();
  const embeddingCost =
    (input.embeddingTokens * env.EMBEDDING_COST_PER_1M_TOKENS) / PER_MILLION;
  const inputCost = (input.inputTokens * env.LLM_INPUT_COST_PER_1M_TOKENS) / PER_MILLION;
  const outputCost =
    (input.outputTokens * env.LLM_OUTPUT_COST_PER_1M_TOKENS) / PER_MILLION;
  const totalUsd =
    Math.round((embeddingCost + inputCost + outputCost) * 1_000_000) / 1_000_000;
  return {
    embeddingTokens: input.embeddingTokens,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalUsd,
  };
}
