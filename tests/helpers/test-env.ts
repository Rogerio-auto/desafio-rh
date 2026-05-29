/**
 * Test-time env defaults. Loaded BEFORE any import that touches `lib/env.ts`.
 * Lets unit tests run without a real `.env` and without requiring a real
 * OpenAI API key.
 */
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_COMPATIBLE_API_KEY ??= "sk-test-fixture";
process.env.OPENAI_COMPATIBLE_BASE_URL ??= "https://api.openai.test/v1";
process.env.LLM_MODEL ??= "gpt-4o-mini";
process.env.EMBEDDING_MODEL ??= "text-embedding-3-small";
process.env.EMBEDDING_DIMENSIONS ??= "1536";
process.env.MAX_QUESTION_LENGTH ??= "2000";
process.env.RAG_TOP_K ??= "5";
process.env.RAG_MIN_SCORE ??= "0.0";
process.env.MAX_CONTEXT_CHARS ??= "12000";
process.env.CHUNK_SIZE_TOKENS ??= "120";
process.env.CHUNK_OVERLAP_TOKENS ??= "20";
process.env.LLM_INPUT_COST_PER_1M_TOKENS ??= "0.15";
process.env.LLM_OUTPUT_COST_PER_1M_TOKENS ??= "0.60";
process.env.EMBEDDING_COST_PER_1M_TOKENS ??= "0.02";
process.env.LOG_LEVEL ??= "fatal";
(process.env as Record<string, string | undefined>)["NODE_ENV"] ??= "test";
process.env.ALLOWED_ORIGINS ??= "http://localhost:3000";
