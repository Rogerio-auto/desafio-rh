import { z } from "zod";
import { loadEnv } from "./env-loader";

loadEnv();

const numeric = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? defaultValue : Number(v)))
    .pipe(z.number().finite());

const positiveInt = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? defaultValue : Number(v)))
    .pipe(z.number().int().positive());

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a postgres connection string",
    }),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((v) =>
      v
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  MAX_QUESTION_LENGTH: positiveInt(2000),
  OPENAI_COMPATIBLE_BASE_URL: z
    .string()
    .url()
    .default("https://api.openai.com/v1"),
  OPENAI_COMPATIBLE_API_KEY: z.string().min(1, "OPENAI_COMPATIBLE_API_KEY is required"),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: positiveInt(1536),
  RAG_TOP_K: positiveInt(5),
  RAG_MIN_SCORE: numeric(0.25),
  MAX_CONTEXT_CHARS: positiveInt(12000),
  CHUNK_SIZE_TOKENS: positiveInt(500),
  CHUNK_OVERLAP_TOKENS: positiveInt(80),
  LLM_INPUT_COST_PER_1M_TOKENS: numeric(0.15),
  LLM_OUTPUT_COST_PER_1M_TOKENS: numeric(0.6),
  EMBEDDING_COST_PER_1M_TOKENS: numeric(0.02),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
