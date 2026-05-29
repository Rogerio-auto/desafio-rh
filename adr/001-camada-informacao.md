# ADR 001 — Camada de informação (RAG sobre Postgres + pgvector)

- **Status:** Aceito
- **Data:** 2026-05-28
- **Decisor(es):** time de engenharia da entrega

## Problema

Cada empresa possui um acervo heterogêneo (PDF, DOCX, XLSX, MD, TXT) que
precisa ser convertido em uma camada consultável pelo agente, garantindo
relevância semântica em perguntas em português e isolamento estrito por
tenant.

## Contexto e restrições

- Reproduzível localmente (PRD §5).
- Postgres local já requerido pelo briefing.
- Latência alvo P95 < 8 s, custo precisa caber em poucos dólares/mês.
- Acervo inicial é pequeno (~12 arquivos), mas a estrutura precisa
  escalar para dezenas de milhares de chunks por tenant.
- A camada precisa suportar reingestão idempotente e adição incremental
  (PRD §4.1).

## Opções consideradas

1. **PostgreSQL + pgvector**
   - Prós: uma única base, isolamento por SQL (`WHERE tenant_id = $`),
     transações ACID, custo zero adicional, fácil de subir local.
   - Contras: requer build/instalação da extensão; índices HNSW custam
     a construir em volumes grandes.
2. **Banco vetorial dedicado (Qdrant, Pinecone, Weaviate)**
   - Prós: feature-set rico (filtros, payload, índices otimizados).
   - Contras: serviço a mais para manter; isolamento por tenant
     normalmente via "collection per tenant" ou metadata-filter, o que
     amplia a superfície de erro; custo extra; latência de rede.
3. **In-memory + FAISS local**
   - Prós: simples para protótipo.
   - Contras: sem persistência transacional; quebra isolamento ao
     compartilhar índices entre processos; não cobre o requisito de
     reprodução com `npm run dev`.

## Decisão

Adotar **PostgreSQL + pgvector**.

- Embeddings vivem em `document_chunks.embedding (vector(1536))`.
- Índice HNSW com `vector_cosine_ops`.
- Todo retrieval roda por `WHERE tenant_id = $1` parametrizado.
- UNIQUE `(tenant_id, content_hash)` em `documents` garante
  idempotência.

## Consequências aceitas

- Operador precisa instalar `pgvector` no servidor Postgres. Documentado
  no README, incluindo passo a passo no Windows.
- Mudança de modelo de embedding com dimensão diferente exige nova
  migration e reingestão (assumido aceitável para a v1).
- Para volumes muito altos (> 1 M de chunks por tenant), HNSW pode
  precisar de tuning ou particionamento. Fora de escopo.
