---
id: F1-S05
title: Integrar upload na page principal + ADR + README
phase: F1
task_ref: null
status: review
priority: medium
estimated_size: S
agent_id: null
claimed_at: 2026-06-01T23:57:33Z
completed_at: 2026-06-02T00:09:22Z
pr_url: null
depends_on:
  - F1-S04
blocks: []
source_docs:
  - PRD.md
  - ARCHITECTURE.md
  - CLAUDE.md
---
# F1-S05 — Integração final na page + documentação

## Objetivo

Plugar os componentes de upload na `src/app/page.tsx`, registrar a decisão arquitetural (`adr/006`) e atualizar o `README.md` com as novas rotas.

## Escopo (faz)

- Modificar `src/app/page.tsx` para incluir duas seções:
  - Seção esquerda (existente): seletor de tenant + chat-panel.
  - Seção direita (nova): `DocumentUpload` + `DocumentList` ligados pelo mesmo `tenantSlug` selecionado. Após upload de sucesso, incrementar `refreshSignal` para forçar refetch da listagem.
  - Layout: grid responsivo (`md:grid-cols-2`), mantendo a aparência dark-first.
  - O tenant selecionado deve ser estado compartilhado entre chat e upload.
- Criar `adr/006-upload-via-ui.md` documentando:
  - Por que upload síncrono (não async/queue) na v2 — escopo de demo local, latência aceitável com OpenAI embeddings em batch.
  - Por que **não** persistir o arquivo cru em disco — buffer descartado pós-embedding; chunks são a fonte de verdade.
  - Por que `MAX_UPLOAD_SIZE_MB=10` default — janela típica de embedding em 1 batch + margem.
  - Trade-off explícito: jobs longos bloqueiam a request. Mitigação futura: outbox + worker.
- Atualizar `README.md`:
  - Adicionar `POST /api/documents` e `GET /api/documents` na seção API com payload/response.
  - Documentar `MAX_UPLOAD_SIZE_MB` em "Variáveis de ambiente" / referência a `.env.example`.
  - Mencionar fluxo via UI na seção "Subindo o projeto" como alternativa ao `npm run ingest`.

## Fora de escopo (NÃO faz)

- Reescrever `chat-panel.tsx`.
- Adicionar autenticação real.
- Mover ingestão para fila assíncrona (decisão futura — apenas documentar como trade-off).
- Modificar componentes de F1-S04.

## Arquivos permitidos (`files_allowed`)

- `src/app/page.tsx`
- `adr/006-upload-via-ui.md`
- `README.md`

## Arquivos proibidos (`files_forbidden`)

- `src/components/**` (F1-S04)
- `src/app/api/**` (F1-S03)
- `adr/001..005-*` (já mergeados, imutáveis)
- `ARCHITECTURE.md` (referenciado mas não alterado neste slot — se precisar, abra slot novo)

## Contratos de entrada

- Componentes `DocumentUpload`, `DocumentList` exportados por `src/components/`.
- API `/api/documents` operacional (F1-S03).

## Contratos de saída

- Página `/` mostra chat e upload lado a lado.
- ADR 006 publicado.
- README descreve uso completo.

## Definition of Done

- [ ] `page.tsx` integra os dois componentes com tenant compartilhado.
- [ ] Após upload, listagem refaz fetch automaticamente.
- [ ] `adr/006-upload-via-ui.md` criado com seções: Contexto, Decisão, Consequências, Alternativas consideradas.
- [ ] README atualizado: seção API + variáveis de ambiente.
- [ ] Smoke manual: subir documento via UI → aparece em "ready" na lista → resposta do chat cita o novo documento.
- [ ] Lint + typecheck + format:check verdes.
- [ ] PR aberto referenciando este slot, com screenshot final da página.

## Validação

```powershell
npm run lint
npx tsc -p tsconfig.json --noEmit
npm run format:check
npm test
```

## Notas para o agente

- Layout: o chat fica útil em telas estreitas, então em `< md` use stack vertical, chat em cima. Em `md+`, grid 2 colunas.
- Estado do `tenantSlug`: levante para `page.tsx` (server component → client component wrapper se preciso). Hoje o chat-panel já tem seu próprio seletor — você vai mover esse estado para um componente client wrapper compartilhado, **sem** mudar a API interna do chat-panel (props compatíveis). Se isso forçar mudanças em chat-panel.tsx, recue: abra slot novo, este é fora de escopo.
- ADR 006: siga o formato dos ADRs existentes em `adr/`. Curto, decisivo, em português, com seções **Contexto**, **Decisão**, **Consequências**, **Alternativas consideradas**.
- Não inflar o README com tudo — adicione apenas o necessário para o avaliador entender a nova funcionalidade.
