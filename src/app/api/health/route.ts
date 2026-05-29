import { NextResponse } from "next/server";
import { sql as pg } from "@/server/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();
  const health: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };

  try {
    const rows = await pg<{ ok: number }[]>`SELECT 1 AS ok`;
    health.database = rows[0]?.ok === 1 ? "ok" : "degraded";
  } catch (err) {
    health.status = "error";
    health.database = "error";
    health.databaseError = err instanceof Error ? err.message : String(err);
  }

  try {
    const ext = await pg<{ extversion: string }[]>`
      SELECT extversion FROM pg_extension WHERE extname = 'vector'
    `;
    health.pgvector = ext[0]?.extversion ?? "missing";
  } catch {
    health.pgvector = "unknown";
  }

  health.latencyMs = Date.now() - startedAt;

  const statusCode = health.status === "ok" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
