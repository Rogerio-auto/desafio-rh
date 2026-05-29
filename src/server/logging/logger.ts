import pino from "pino";
import { getEnv } from "@/lib/env";

const SENSITIVE_KEYS = [
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENAI_API_KEY",
  "api_key",
  "apiKey",
  "authorization",
  "Authorization",
  "password",
  "DATABASE_URL",
];

const env = getEnv();

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: "rh-ai-agent",
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: SENSITIVE_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
    censor: "[REDACTED]",
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

export type Logger = typeof logger;
