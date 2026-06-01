---
id: F1-S04
title: Componentes React de upload e listagem de documentos
phase: F1
task_ref: null
status: in-progress
priority: medium
estimated_size: M
agent_id: null
claimed_at: 2026-06-01T23:47:05Z
completed_at: null
pr_url: null
depends_on:
  - F1-S03
blocks:
  - F1-S05
source_docs:
  - PRD.md
  - CLAUDE.md
---
# F1-S04 — Upload UI

## Objetivo

Entregar os componentes React que consomem `POST /api/documents` e `GET /api/documents`, isolados do `page.tsx` para que a integração final (F1-S05) seja trivial.

## Escopo (faz)

- `src/components/document-upload.tsx`:
  - Client component (`'use client'`).
  - Props: `{ tenantSlug: string; onUploaded?: (doc: { id: string; status: string }) => void }`.
  - Input file (`<input type="file" accept=".pdf,.docx,.xlsx,.md,.txt">`) + área de drag-and-drop.
  - Mostra progresso (sending / processing) com estado local.
  - Estados visíveis: idle, uploading, success (com nome do arquivo e contagem de chunks), duplicate (mensagem clara), error (mensagem curta vinda do servidor).
  - Acessibilidade: label associado ao input, `aria-live="polite"` no estado.
- `src/components/document-list.tsx`:
  - Client component.
  - Props: `{ tenantSlug: string; refreshSignal?: number }` (incrementar refreshSignal força re-fetch).
  - `useEffect` chama `GET /api/documents?tenant=...` na montagem e quando `refreshSignal` muda.
  - Renderiza tabela com colunas: arquivo, mime, status (badge), atualizado em.
  - Paginação simples "Carregar mais" usando `nextCursor`.
  - Estados: loading, empty, error.
- `src/components/document-status-badge.tsx`:
  - Pure component que recebe `status: DocumentStatus` e devolve badge com cor/texto coerentes.

- Estilização: Tailwind, paleta dark-first coerente com o `chat-panel.tsx` existente. Sem libs novas.
- Tipos: importar `DocumentStatus` derivado do schema via re-export server→client é proibido (server-only); duplicar o union como `as const` num `src/components/document-status.ts` se necessário, ou inferir da response da API.

## Fora de escopo (NÃO faz)

- Mudar `src/app/page.tsx` (F1-S05).
- Endpoint de delete/retry (slot futuro).
- Testes de componente (RTL ainda não configurado — slot dedicado se necessário). Validação visual via `npm run dev` documentada no PR.
- Internacionalização.

## Arquivos permitidos (`files_allowed`)

- `src/components/document-upload.tsx`
- `src/components/document-list.tsx`
- `src/components/document-status-badge.tsx`
- `src/components/document-status.ts`

## Arquivos proibidos (`files_forbidden`)

- `src/components/chat-panel.tsx` (não tocar — slot fora de escopo)
- `src/app/page.tsx` (F1-S05)
- `src/app/api/**` (F1-S03)
- `src/server/**` (regra de boundary — UI não importa do server)

## Contratos de entrada

- `POST /api/documents` e `GET /api/documents` no shape definido em F1-S03.
- Status enum `"pending" | "processing" | "ready" | "failed"`.

## Contratos de saída

```ts
// Componentes exportados como default:
export default function DocumentUpload(props: {
  tenantSlug: string;
  onUploaded?: (doc: { id: string | null; status: string; chunks?: number }) => void;
}): JSX.Element;

export default function DocumentList(props: {
  tenantSlug: string;
  refreshSignal?: number;
}): JSX.Element;

export default function DocumentStatusBadge(props: {
  status: "pending" | "processing" | "ready" | "failed";
}): JSX.Element;
```

## Definition of Done

- [ ] 3 componentes implementados, tipados, sem `any`.
- [ ] Sem import de `@/server/...` em arquivos de UI.
- [ ] `npm run dev` mostra upload funcionando ponta-a-ponta (smoke manual documentado no PR).
- [ ] Lint + typecheck verdes.
- [ ] PR aberto referenciando este slot, com screenshot do estado idle e do estado pós-upload.

## Validação

```powershell
npm run lint
npx tsc -p tsconfig.json --noEmit
npm run format:check
```

## Notas para o agente

- A regra `src/server/` é privada de servidor (CLAUDE.md). Reimportar `DocumentStatus` server-side é proibido — copie o union literal localmente em `src/components/document-status.ts`. É código duplicado consciente, justificado pelo boundary.
- Upload: use `FormData` nativo + `fetch('/api/documents', { method: 'POST', body: form })`. Sem libs externas.
- Erros do backend vêm como `{ error: string }`. Sempre exibir mensagem amigável; em `413` mostre "Arquivo excede o limite" sem repetir os bytes.
- Drag-and-drop: implementação mínima com `onDragOver/onDrop`. Não importe `react-dropzone`.
- Estilo: olhe `chat-panel.tsx` para tipografia e espaçamento — mantenha coerência. Dark-first.
