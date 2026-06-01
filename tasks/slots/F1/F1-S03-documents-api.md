---
id: F1-S03
title: API /api/documents (POST upload + GET listagem por tenant)
phase: F1
task_ref: null
status: available
priority: high
estimated_size: M
agent_id: null
claimed_at: null
completed_at: null
pr_url: null
depends_on:
  - F1-S02
blocks:
  - F1-S04
source_docs:
  - PRD.md
  - ARCHITECTURE.md
  - CLAUDE.md
---

# F1-S03 — Documents API (upload + listagem)

## Objetivo

Expor `POST /api/documents` (upload multipart com validação de tamanho/mime) e `GET /api/documents?tenant=X` (listagem isolada por tenant), reusando `ingestBuffer` do F1-S02.

## Contexto

A CLI de ingestão atende o avaliador, não o usuário final. Para a tela de RH carregar arquivos sem terminal, precisamos de uma rota HTTP com as mesmas garantias do CLI: idempotência por hash, isolamento por tenant, custo logado, mensagem de erro sem vazar internals. PRD §9.3 e §12 (segurança).

## Escopo (faz)

- Criar `src/app/api/documents/route.ts` com exports `POST` e `GET`.
- **POST**:
  - Aceita `multipart/form-data` com campos `tenant` (string slug) e `file` (binário).
  - Reuso de CORS via `applyCorsHeaders` (existente em `src/server/security/cors.ts`).
  - Validar com Zod: `tenant` slug match contra `TENANT_CONFIGS`, `file` presente.
  - Rejeitar `file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024` com `413`.
  - Rejeitar extensão fora de `isSupportedFile` com `415`.
  - Resolver tenant via `getOrCreateTenant`, chamar `ingestBuffer`.
  - Responder `200` com `{ documentId, status: 'ingested' | 'skipped_duplicate' | 'failed', chunks?, error? }`.
  - Log estruturado (mesmo formato do `/api/chat`): `tenant`, `fileName`, `bytesIn`, `status`, `latencyMs`, `chunks`, `documentId`. NÃO logar conteúdo nem hash completo.
- **GET**:
  - Query: `tenant` (obrigatório), `limit` (default 50, max 200), `cursor` (opcional, base64 do `createdAt|id`).
  - Validar query com Zod.
  - Retornar `{ items: [{ id, fileName, mimeType, status, error, processedAt, createdAt }], nextCursor }`.
  - Filtro **obrigatório** por `tenant_id` resolvido pelo slug — nunca aceitar `tenant_id` direto do cliente.
  - Ordenar `createdAt DESC, id DESC` (estável para cursor).
- Adicionar `MAX_UPLOAD_SIZE_MB` no schema de env (`src/lib/env.ts`) com default `10` e parse via Zod.
- Adicionar `MAX_UPLOAD_SIZE_MB=10` em `.env.example`.
- Testes em `tests/unit/api-documents.test.ts`:
  - POST 400 quando payload faltando.
  - POST 403 quando origin não permitido.
  - POST 404 quando tenant slug desconhecido.
  - POST 413 quando arquivo > limite.
  - POST 415 quando extensão inválida.
  - POST 200 happy path (mock de `ingestBuffer`).
  - POST 200 com `status='skipped_duplicate'` no segundo upload do mesmo conteúdo.
  - GET 400 quando query inválida.
  - GET retorna apenas docs do tenant requisitado (isolation).
  - GET paginação funciona com `cursor` (insert 3 docs, listar com `limit=2`, segundo page traz o terceiro).

## Fora de escopo (NÃO faz)

- UI (F1-S04).
- Endpoint de delete/reprocess (slot futuro).
- Persistência do arquivo cru em disco — buffer é descartado.
- Autenticação real (continua sem auth — F1-S03 só limita por tenant slug).

## Arquivos permitidos (`files_allowed`)

- `src/app/api/documents/route.ts`
- `src/lib/env.ts`
- `.env.example`
- `tests/unit/api-documents.test.ts`

## Arquivos proibidos (`files_forbidden`)

- `src/server/ingest/ingestor.ts` (F1-S02 é dono)
- `src/app/api/chat/route.ts` (não toca)
- `src/server/security/cors.ts` (reuso, não modifica)

## Contratos de entrada

- `ingestBuffer(opts)` exportado por `src/server/ingest/ingestor.ts` (F1-S02).
- `getOrCreateTenant(slug)` em `src/server/tenants/service.ts`.
- `applyCorsHeaders(req, res)` / `corsPreflight(req)` em `src/server/security/cors.ts`.
- `getEnv()` retorna `MAX_UPLOAD_SIZE_MB` após este slot.

## Contratos de saída

```ts
// POST /api/documents request
// Content-Type: multipart/form-data
// fields: tenant=<slug>, file=<binary>

// POST response 200
{
  documentId: string | null,        // null se skipped_duplicate
  status: "ingested" | "skipped_duplicate" | "failed",
  chunks?: number,
  error?: string
}

// GET /api/documents?tenant=norteverde&limit=50&cursor=...
{
  items: Array<{
    id: string,
    fileName: string,
    mimeType: string,
    status: "pending" | "processing" | "ready" | "failed",
    error: string | null,
    processedAt: string | null,    // ISO
    createdAt: string              // ISO
  }>,
  nextCursor: string | null
}
```

## Definition of Done

- [ ] `POST /api/documents` implementado conforme contrato.
- [ ] `GET /api/documents` implementado conforme contrato.
- [ ] `MAX_UPLOAD_SIZE_MB` adicionado em `src/lib/env.ts` + `.env.example`.
- [ ] Validação Zod no payload e na query.
- [ ] CORS aplicado igual ao `/api/chat`.
- [ ] Log estruturado por requisição, sem vazar conteúdo de arquivo.
- [ ] Testes em `tests/unit/api-documents.test.ts` verdes, incluindo isolamento por tenant.
- [ ] Lint + typecheck verdes.
- [ ] PR aberto referenciando este slot.

## Validação

```powershell
npm run lint
npx tsc -p tsconfig.json --noEmit
npm test -- tests/unit/api-documents.test.ts tests/unit/cors.test.ts tests/unit/retrieval-isolation.test.ts
```

## Notas para o agente

- Next 15 App Router suporta `request.formData()` nativo — não importe `formidable` ou similar.
- Cursor encoding: `Buffer.from(JSON.stringify({ createdAt, id })).toString('base64url')`. Decoda com `try/catch`; cursor inválido → `400`.
- `request.headers.get('content-length')` pode ser usado como pré-check rápido antes do `formData()` para rejeitar uploads gigantes sem alocar memória. Se exceder, responder `413` direto.
- Logs: use `logger.child({ route: 'documents', method: ... })`. Não inclua `file.name` em error response que vai pro cliente além do mínimo necessário.
- Status HTTP precisos: 400 (validation), 403 (CORS), 404 (tenant), 413 (size), 415 (mime), 500 (server). Não vazar stack trace.
