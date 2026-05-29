# ADR 004 — Estratégia de recuperação de contexto

- **Status:** Aceito
- **Data:** 2026-05-28

## Problema

Decidir como o sistema busca trechos relevantes do acervo de cada tenant
e quanto contexto envia ao LLM, balanceando relevância, custo e latência.

## Contexto e restrições

- Documentos heterogêneos (PDF/DOCX/XLSX/MD/TXT), sem padronização.
- Acervo inicial pequeno (~12 arquivos × poucos KB), mas precisa escalar.
- Custo precisa caber em poucos dólares/mês (ADR 003).
- Latência P95 < 8 s (PRD §5).
- Respostas exclusivamente baseadas no acervo da empresa (PRD §4.2).

## Opções consideradas

1. **Busca lexical (BM25) apenas.** Simples; falha em paráfrases e
   sinônimos comuns em PT-BR.
2. **Busca vetorial apenas.** Forte em sinônimos; pode pegar "vizinhos
   semânticos" irrelevantes.
3. **Híbrida (lexical + vetorial + rerank).** Melhor recall e precisão;
   complexidade extra (BM25 no Postgres + reranker externo).
4. **Vetorial + threshold + budget de contexto.** Cobre 90% dos casos
   sem dependência adicional, e abre caminho para híbrida no futuro.

## Decisão

Adotar a opção **4** na v1:

- **Embedding** por chunk (text-embedding-3-small / 1536 dim).
- **Similaridade** cosine (operador `<=>` do pgvector) com índice HNSW
  (`vector_cosine_ops`).
- **Top-K configurável** (`RAG_TOP_K=5`) com **min-score**
  (`RAG_MIN_SCORE=0.25`) para descartar vizinhos fracos.
- **Budget de contexto** (`MAX_CONTEXT_CHARS=12000`) — chunks são
  empilhados em ordem de similaridade até atingir o budget; o resto é
  ignorado.
- **Chunking** por tokens (`tiktoken` para o modelo configurado), com
  overlap (`CHUNK_OVERLAP_TOKENS=80`) e preferência por terminar em
  parágrafo/sentença quando uma quebra natural cai nos últimos 15% da
  janela.

A híbrida (BM25 + vetor + rerank) fica como evolução futura e tem
caminho claro: o Postgres já roda BM25 via `tsvector`, e o pipeline
isola o ponto de mescla em `runChat`.

## Consequências aceitas

- Recall potencialmente menor que híbrida em consultas muito específicas
  com termos raros.
- Se o operador trocar de modelo de embedding com dimensão diferente,
  precisa gerar nova migration (`vector(N)`) e reingerir.
- O `min-score` é genérico; pode requerer tuning por tenant em volumes
  maiores.
