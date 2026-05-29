import { getEnv } from "@/lib/env";

export function buildCorsHeaders(originHeader: string | null): HeadersInit {
  const env = getEnv();
  const allowed = env.ALLOWED_ORIGINS;
  const headers: Record<string, string> = {
    Vary: "Origin",
  };
  if (originHeader && allowed.includes(originHeader)) {
    headers["Access-Control-Allow-Origin"] = originHeader;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

export function isOriginAllowed(originHeader: string | null): boolean {
  if (!originHeader) return true;
  return getEnv().ALLOWED_ORIGINS.includes(originHeader);
}
