import { z } from "zod";
import { getEnv } from "@/lib/env";
import { TENANT_SLUGS } from "@/server/tenants/config";

export function getChatRequestSchema() {
  const env = getEnv();
  return z.object({
    tenant: z.enum(TENANT_SLUGS as [string, ...string[]], {
      errorMap: () => ({
        message: `tenant deve ser um de: ${TENANT_SLUGS.join(", ")}`,
      }),
    }),
    question: z
      .string()
      .trim()
      .min(3, "Pergunta muito curta")
      .max(env.MAX_QUESTION_LENGTH, `Pergunta excede ${env.MAX_QUESTION_LENGTH} caracteres`),
  });
}

export type ChatRequest = z.infer<ReturnType<typeof getChatRequestSchema>>;
