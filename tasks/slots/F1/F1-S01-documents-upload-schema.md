---
id: F1-S01
title: Schema documents para upload async (status + error + processed_at)
phase: F1
task_ref: null
status: available
priority: high
estimated_size: XS
agent_id: null
claimed_at: null
completed_at: null
pr_url: null
depends_on: []
blocks:
  - F1-S02
source_docs:
  - PRD.md
  - ARCHITECTURE.md
  - CLAUDE.md
---

# F1-S01 — Schema documents para upload via UI

## Objetivo

Evoluir a tabela `documents` para representar o ciclo de vida de um upload feito pela UI (pendente / processando / pronto / falhou), com motivo do erro e timestamp de conclusão.

## Contexto

A pipeline atual (`src/server/ingest/ingestor.ts`) só roda em CLI e insere o documento já em `status: "ready"`. Quando o upload vier pela UI, precisamos persistir o documento *antes* do embedding para que o usuário veja o estado real e para que falhas (parse, embedding, transação) sejam auditáveis. PRD §4 deixava upload via UI fora da v1 — agora entra na v2.

## Escopo (faz)

- Estender `documents` em `src/server/db/schema.ts` com:
  - `error: text('error')` (nullable) — mensagem de falha em caso de `status='failed'`.
  - `processedAt: timestamp('processed_at', { withTimezone: true })` (nullable) — preenchido quando `status` vira `ready` ou `failed`.
- Padronizar os valores possíveis de `documents.status` em um union TypeScript exportado: `"pending" | "processing" | "ready" | "failed"`. Default no banco continua `"ready"` (preserva CLI atual).
- Gerar nova migration Drizzle via `npm run db:generate -- --name documents_upload`. Não editar o SQL gerado à mão depois.
- Adicionar índice `documents_tenant_status_idx` em `(tenant_id, status)` para suportar listagens filtradas por status.
- Cobrir com teste de tipos + verificação de presença das colunas/índice no SQL gerado.

## Fora de escopo (NÃO faz)

- Refatorar o ingestor para usar buffer (F1-S02).
- Criar endpoint HTTP (F1-S03).
- Tocar UI (F1-S04 / F1-S05).
- Backfill de dados — base local de desenvolvimento, `npm run db:migrate` resolve.

## Arquivos permitidos (`files_allowed`)

- `src/server/db/schema.ts`
- `src/server/db/migrations/0001_*.sql`
- `src/server/db/migrations/meta/_journal.json`
- `src/server/db/migrations/meta/0001_snapshot.json`
- `tests/unit/schema-documents.test.ts`

## Arquivos proibidos (`files_forbidden`)

- `src/server/ingest/ingestor.ts` (F1-S02 é dono)
- `src/server/db/migrations/0000_initial.sql` (já aplicado em ambientes)

## Contratos de entrada

- Schema atual em `src/server/db/schema.ts` com `documents.status text not null default 'ready'`.
- Drizzle 0.38, journal em `src/server/db/migrations/meta/_journal.json`.

## Contratos de saída

```ts
// src/server/db/schema.ts
export const DOCUMENT_STATUSES = ["pending", "processing", "ready", "failed"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

// columns adicionadas em documents:
//   error: text | null
//   processed_at: timestamp(tz) | null
// índice novo: documents_tenant_status_idx ON documents (tenant_id, status)
```

## Definition of Done

- [ ] Schema atualizado com `error`, `processedAt` e índice composto.
- [ ] `DOCUMENT_STATUSES` exportado e tipado.
- [ ] Migration `0001_documents_upload.sql` gerada + `_journal.json` + snapshot atualizados.
- [ ] `npm run db:migrate` aplica limpo em base limpa (smoke local).
- [ ] Teste `tests/unit/schema-documents.test.ts` verde.
- [ ] Lint + typecheck verdes.
- [ ] PR aberto referenciando este slot.

## Validação

```powershell
npm run lint
npx tsc -p tsconfig.json --noEmit
npm test -- tests/unit/schema-documents.test.ts
python scripts/slot.py check-migrations
```

## Notas para o agente

- Para gerar migration: `npm run db:generate -- --name documents_upload`. Inspecione o SQL antes de commitar — Drizzle às vezes ordena ALTER de forma sub-ótima, mas não edite o arquivo gerado.
- O default do `status` no banco fica `'ready'` para não quebrar o ingestor CLI atual. F1-S02 vai escrever explicitamente `'pending'`/`'processing'`/`'ready'` quando vier de buffer.
- `DOCUMENT_STATUSES` deve ser `as const` para o tipo inferido ser literal union.
