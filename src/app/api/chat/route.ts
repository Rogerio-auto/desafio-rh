import { NextResponse, type NextRequest } from "next/server";
import { runChat, ChatPipelineError } from "@/server/rag/pipeline";
import { getChatRequestSchema } from "@/server/security/validation";
import { buildCorsHeaders, isOriginAllowed } from "@/server/security/cors";
import { logger } from "@/server/logging/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  const headers = buildCorsHeaders(req.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && !isOriginAllowed(origin)) {
    return NextResponse.json(
      { error: "Origin not allowed" },
      { status: 403, headers: buildCorsHeaders(origin) },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body inválido — esperava JSON" },
      { status: 400, headers: buildCorsHeaders(origin) },
    );
  }

  const schema = getChatRequestSchema();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Payload inválido",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400, headers: buildCorsHeaders(origin) },
    );
  }

  try {
    const result = await runChat({
      tenantSlug: parsed.data.tenant,
      question: parsed.data.question,
    });
    return NextResponse.json(result, {
      status: 200,
      headers: buildCorsHeaders(origin),
    });
  } catch (err) {
    if (err instanceof ChatPipelineError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode, headers: buildCorsHeaders(origin) },
      );
    }
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "chat_route_unhandled",
    );
    return NextResponse.json(
      { error: "Erro interno ao processar a pergunta" },
      { status: 500, headers: buildCorsHeaders(origin) },
    );
  }
}
