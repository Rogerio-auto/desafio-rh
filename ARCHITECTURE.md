# Architecture

Documento de arquitetura — escolhas, trade-offs e fluxo. Para decisões
individuais documentadas no formato ADR, veja `adr/`.

---

## Visão geral

```
┌───────────────────┐      POST /api/chat       ┌──────────────────────┐
│  Browser (React)  │ ────────────────────────▶ │  Next.js (App Router)│
│  Chat UI (Tail.)  │                            │  src/app/api/chat    │
└───────────────────┘                            └──────────┬───────────┘
                                                            │
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │ Zod validation       │
                                                 │ Tenant resolve       │
                                                 └──────────┬───────────┘
                                                            │
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │ generateQueryEmbed   │
                                                 │ (OpenAI-compatible)  │
                                                 └──────────┬───────────┘
                                                            │
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │ retrieveChunks       │
                                                 │ WHERE tenant_id = ?  │
                                                 │ ORDER BY embedding<= │
                                                 │ LIMIT k              │
                                                 └──────────┬───────────┘
                                                            │
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │ generateChatComplete │
                                                 │ system + contexto    │
                                                 └──────────┬───────────┘
                                                            │
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │ INSERT chat_interact │
                                                 │ + structured log     │
                                                 └──────────┬───────────┘
                                                            │
                                                            ▼
                                                       JSON response
```

Diagrama mais detalhado (texto-puro) em `docs/arquitetura.md`.

---

## Boundaries

| Camada | Localização | Pode falar com |
|---|---|---|
| UI | `src/app/`, `src/components/` | Só com a API HTTP. Nunca importa de `server/`. |
| API routes | `src/app/api/*/route.ts` | `server/security`, `server/rag/pipeline`. |
| Pipeline | `src/server/rag/pipeline.ts` | `tenants/service`, `ai/*`, `db/client`. |
| Retriever | `src/server/rag/retriever.ts` | `db/client`, `lib/env`. **Recebe `Tenant`, não string.** |
| Tenants | `src/server/tenants/*` | `db/client`. Único ponto que materializa um tenant. |
| Ingestion | `src/server/ingest/*` | `db/client`, `ai/embeddings`, `rag/chunker`. |
| DB | `src/server/db/*` | Postgres via `postgres` driver. |

A regra-mestra: nada que faça query vetorial pode existir fora de
`src/server/rag/retriever.ts`. Mover essa lógica para um helper "genérico"
quebra o contrato de isolamento.

---

## Multi-tenant isolation

Três defesas em camadas, todas obrigatórias:

1. **Tipo** — `retrieveChunks` recebe `Tenant` (objeto materializado pelo
   `resolveTenant`), nunca uma string. Tentar passar `string` é erro de
   compilação.
2. **SQL** — O filtro `WHERE c.tenant_id = ${tenant.id}` é literal no
   código, parametrizado. Não é configurável.
3. **Schema** — `documents`, `document_chunks` e `chat_interactions` têm
   FK obrigatória para `tenants.id` com `ON DELETE CASCADE`, e índices
   em `tenant_id` para o filtro ser O(log n).

O `tests/unit/retrieval-isolation.test.ts` materializa o comportamento
esperado: para a mesma query, a mesma similaridade alta, a função
filtrada por tenant nunca retorna chunks de outro tenant.

Ver `adr/002-isolamento-multi-tenant.md`.

---

## RAG

- **Chunking** — `tiktoken` para um token-count exato (gpt-4o-mini), com
  overlap de ~16% e uma "soft preference" para terminar em quebras de
  parágrafo/sentença quando uma fica nos últimos 15% da janela.
- **Embedding** — `text-embedding-3-small`, 1536 dimensões. Configurável
  via `EMBEDDING_MODEL` + `EMBEDDING_DIMENSIONS`.
- **Similaridade** — operador `<=>` do pgvector (cosine distance). Índice
  HNSW com `vector_cosine_ops`. Cosine se comporta melhor para texto
  multilíngue do que dot-product não-normalizado.
- **Top-K + min score** — `RAG_TOP_K=5` e `RAG_MIN_SCORE=0.25` são
  defaults conservadores. Em produção, ajustar à distribuição real do
  acervo.
- **Context budget** — após `top-k`, trimamos para
  `MAX_CONTEXT_CHARS=12000` para evitar respostas longas e custo alto.
- **System prompt** — exige PT-BR, citação de arquivo entre parênteses,
  resposta canônica "Não encontrei evidência documental suficiente"
  quando não há contexto.

Ver `adr/003-modelo-linguagem.md` e `adr/004-recuperacao-contexto.md`.

---

## Custos

Fórmula:

```
custo = embeddingTokens * P_embed/1e6
      + inputTokens     * P_in   /1e6
      + outputTokens    * P_out  /1e6
```

Preços (`P_*`) vêm do `.env`. Defaults coincidem com OpenAI em
janeiro/2026 (`gpt-4o-mini` + `text-embedding-3-small`):

| Variável | Default |
|---|---:|
| `EMBEDDING_COST_PER_1M_TOKENS` | 0,02 |
| `LLM_INPUT_COST_PER_1M_TOKENS` | 0,15 |
| `LLM_OUTPUT_COST_PER_1M_TOKENS`| 0,60 |

Premissas para o orçamento mensal (PRD: 5 000 perguntas / empresa, 3
empresas):

| Item | Tokens / pergunta | Custo / pergunta |
|---|---:|---:|
| Embedding query | 20 | US$ 0,0000004 |
| Prompt (sys + 5 chunks × ~250 tok + pergunta) | ~1 500 | US$ 0,000225 |
| Resposta | 200 | US$ 0,00012 |
| **Total** | | **US$ 0,000346** |

15 000 perguntas / mês → **~US$ 5,19 / mês** (mais ingestão one-shot
de embeddings: 12 arquivos × ~3 000 tok = 36 000 tok = US$ 0,00072,
desprezível).

Latência típica:
- Embedding: 100–300 ms
- Vector search (10–20 k chunks, HNSW): < 50 ms
- LLM gpt-4o-mini com 1,5 k tokens: 1–3 s
- Total P95 esperado: **~3–5 s**, dentro da meta de 8 s do PRD.

---

## Logging

Pino emite JSON em uma linha por evento, com:

- `timestamp` (ISO 8601)
- `service`: `rh-ai-agent`
- `env`: `development | production`
- `tenant`: slug
- `question`
- `documentsRetrieved`: nomes únicos
- `latencyMs`
- `estimatedCostUsd`
- `status`: `success | error`
- `error?`: mensagem (sem stack para o cliente)

Chaves potencialmente sensíveis (`OPENAI_*`, `DATABASE_URL`, `password`)
são redatadas automaticamente — ver `redact` em `logger.ts`.

Exemplos: `logs-exemplo/exemplo-interacao.jsonl`.

---

## Trade-offs aceitos

| Escolha | Trade-off |
|---|---|
| Cliente OpenAI-compatible único | Ganha portabilidade entre providers; abdica de features específicas (function calling Anthropic etc.) — fora de escopo nessa v1. |
| HNSW em vez de IVFFlat | Latência melhor sob carga; build do índice mais lento. Aceitável para 10–100k chunks. |
| Tiktoken para chunking | Dependência WASM extra; em troca, count de tokens exato. Alternativa: chunk por caracteres (perde precisão de custo). |
| In-memory store nos testes | Não exercita SQL real. Em troca, suíte roda em < 5 s, sem precisar de DB. Os contratos críticos (tipo e SQL literal) são exercitados em testes próprios. |
| Sem autenticação | Fora de escopo da v1 (PRD §4). Em produção, plugar SSO/OIDC; o tenant teria que vir do token, não do payload. |

---

## Estrutura de pastas — justificativa

Separação por **risco/responsabilidade**, não por tipo de arquivo:

- `src/app/` é totalmente Next.js e UI-driven. Não conhece o domínio.
- `src/server/` é o domínio. Cada subpasta é uma fronteira semântica e
  pode ser revisada de forma independente.
- `src/lib/` é só utilitário puro (sem efeitos colaterais relevantes).
- `src/scripts/` são entrypoints CLI. Cada um termina a conexão Postgres
  no `finally` para evitar processos pendurados.
- `tests/` espelha `src/`, mas com sufixo `.test.ts`.
