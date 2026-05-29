import OpenAI from "openai";
import { getEnv } from "@/lib/env";

let cached: OpenAI | null = null;

/**
 * Returns a singleton OpenAI-compatible client. The base URL is configurable
 * via env so the same code works with OpenAI, OpenRouter, Groq, Together,
 * Azure OpenAI, or any other provider that exposes an OpenAI-compatible API.
 */
export function getAiClient(): OpenAI {
  if (cached) return cached;
  const env = getEnv();
  cached = new OpenAI({
    apiKey: env.OPENAI_COMPATIBLE_API_KEY,
    baseURL: env.OPENAI_COMPATIBLE_BASE_URL,
  });
  return cached;
}

export function resetAiClientForTests(): void {
  cached = null;
}
