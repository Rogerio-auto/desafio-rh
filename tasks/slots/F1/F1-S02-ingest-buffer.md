---
id: F1-S02-ingest-buffer
title: Expor ingestBuffer e reaproveitar pipeline na CLI
phase: F1
task_ref: null
status: blocked
priority: high
estimated_size: S
agent_id: null
claimed_at: null
completed_at: null
pr_url: null
depends_on:
  - F1-S01-documents-upload-schema
blocks:
  - F1-S03-documents-api
source_docs:
  - PRD.md
  - ARCHITECTURE.md
  - CLAUDE.md
---

# F1-S02 — Ingestão a partir de buffer

## Objetivo

Permitir que o pipeline de ingestão (hash → dedup → parse → chunk → embed → insert) seja invocado a partir de um `Buffer` em memória, sem depender do filesystem, mantendo idempotência e isolamento por tenant.

## Contexto

Hoje `ingestSingleFile` lê do disco (`fs.readFile`). A API de upload (F1-S03) recebe `File` via multipart, não tem path canônico, e não deveria escrever em disco. Precisamos de uma função pura de domínio que aceite `(tenant, buffer, fileName) → resultado` e que o CLI use por baixo dos panos para evitar duas pipelines divergentes.

## Escopo (faz)

- Adicionar export `ingestBuffer(opts: IngestBufferOptions): Promise<IngestFileResult>` em `src/server/ingest/ingestor.ts`.
- `IngestBufferOptions = { tenant: Tenant; buffer: Buffer; fileName: string; embedFn: (texts: string[]) => Promise<number[][]> }`.
- Mover o miolo de `ingestSingleFile` para `ingestBuffer`. `ingestSingleFile` passa a ser um wrapper que faz `fs.readFile(filePath)` e chama `ingestBuffer`.
- Persistir `documents.status = 'ready'` + `processedAt = now()` no caminho feliz; em falha de parse/embed/transação, persistir `documents.status = 'failed'` + `error` (mensagem curta, sem stack trace) + `processedAt = now()` numa **transação separada** se o documento já tiver sido criado, ou retornar `failed` sem inserir caso a falha aconteça antes da criação.
- Validar extensão via `isSupportedFile` antes de qualquer trabalho.
- Não logar conteúdo do arquivo — apenas `fileName`, `tenantSlug`, `contentHash` (12 primeiros chars), `chunks`, `status`, `latencyMs`.
- Testes em `tests/unit/ingestor-buffer.test.ts`:
  - Idempotência: chamar `ingestBuffer` duas vezes com o mesmo buffer e tenant → segunda retorna `skipped_duplicate`, sem novo embedding.
  - Isolamento: mesmo buffer para tenant A e tenant B → ambos ingeridos (uniqueness é por `(tenant_id, content_hash)`).
  - Buffer vazio → `failed` com `reason='empty_extracted_text'`.
  - Extensão não suportada → `failed` com `reason='unsupported_extension'`.

## Fora de escopo (NÃO faz)

- Criar rota HTTP (F1-S03).
- Mudar schema (F1-S01 já entregou).
- Persistência de arquivos em disco — buffer é descartado após embedding.

## Arquivos permitidos (`files_allowed`)

- `src/server/ingest/ingestor.ts`
- `tests/unit/ingestor-buffer.test.ts`

## Arquivos proibidos (`files_forbidden`)

- `src/server/db/schema.ts` (F1-S01)
- `src/scripts/ingest.ts` (não muda — usa o mesmo `ingestDirectory` que continua chamando `ingestSingleFile`)
- `src/server/ingest/parsers.ts` (não muda)

## Contratos de entrada

- `DOCUMENT_STATUSES` e tipo `DocumentStatus` disponíveis (F1-S01).
- `documents.error` e `documents.processedAt` existem no schema (F1-S01).
- `extractTextFromBuffer`, `getMimeType`, `isSupportedFile` em `src/server/ingest/parsers.ts`.
- `sha256Hex` em `src/server/ingest/hash.ts`.
- `chunkText` em `src/server/rag/chunker.ts`.
- `generateEmbeddings` em `src/server/ai/embeddings.ts`.

## Contratos de saída

```ts
export interface IngestBufferOptions {
  tenant: Tenant;
  buffer: Buffer;
  fileName: string;
  embedFn: (texts: string[]) => Promise<number[][]>;
}

export async function ingestBuffer(opts: IngestBufferOptions): Promise<IngestFileResult>;
// IngestFileResult já existente — adicionar campo opcional `documentId?: string` ao status 'ingested'.
```

## Definition of Done

- [ ] `ingestBuffer` exportado e tipado.
- [ ] `ingestSingleFile` reescrito como wrapper de `ingestBuffer`.
- [ ] CLI (`npm run ingest`) continua funcionando — `tests/unit/idempotency.test.ts` permanece verde.
- [ ] Novos testes em `tests/unit/ingestor-buffer.test.ts` verdes.
- [ ] `IngestFileResult` retorna `documentId` em caso de `ingested`.
- [ ] Lint + typecheck verdes.
- [ ] PR aberto referenciando este slot.

## Validação

```powershell
npm run lint
npx tsc -p tsconfig.json --noEmit
npm test -- tests/unit/ingestor-buffer.test.ts tests/unit/idempotency.test.ts tests/unit/retrieval-isolation.test.ts
```

## Notas para o agente

- `embedFn` é injetado para os testes — em produção, `ingestDirectory` continua passando o adapter real.
- Em caso de falha **após** o `INSERT documents` (ex: erro no embedding ou no insert dos chunks), atualizar `documents.status='failed'` numa transação curta separada. Não use uma transação aninhada — o `db.transaction` do Drizzle não suporta savepoints triviais. Estratégia: tente o caminho feliz dentro de uma transação; se ela lançar, faça `UPDATE` fora da transação principal.
- A mensagem em `documents.error` deve ser **curta** (max ~500 chars). Truncar se necessário. Nunca incluir API keys ou paths absolutos.
