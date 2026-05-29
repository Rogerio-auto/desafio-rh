# Arquitetura — diagrama de componentes

```
┌─────────────────────────────────────────────────────────────────────┐
│                              CLIENTE                                │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  Next.js App Router (RSC)                                    │  │
│   │   - src/app/page.tsx          ← seletor de tenant + form     │  │
│   │   - src/components/chat-panel.tsx (Client Component)         │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                          │  fetch POST /api/chat                    │
└──────────────────────────┼──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            EDGE / API                               │
│                                                                     │
│   src/app/api/chat/route.ts                                         │
│   ─────────────────────────                                         │
│    1. CORS check (security/cors.ts)                                 │
│    2. JSON.parse + Zod (security/validation.ts)                     │
│    3. runChat()                                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           PIPELINE RAG                              │
│                                                                     │
│   src/server/rag/pipeline.ts › runChat()                            │
│   ─────────────────────────────────────                             │
│    1. tenants/service.resolveTenant(slug)        → Tenant           │
│    2. ai/embeddings.generateQueryEmbedding(q)    → vector[1536]     │
│    3. rag/retriever.retrieveChunks({tenant, v})  → chunks (filtered)│
│    4. trimContextToBudget(chunks, MAX_CTX)                          │
│    5. ai/chat.generateChatCompletion(q, ctx)     → answer           │
│    6. ai/cost.estimateCostUsd(tokens)            → US$              │
│    7. db.insert(chat_interactions)                                  │
│    8. logger.info({structured event})                               │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                              POSTGRES                               │
│   ┌─────────────┐   ┌───────────────┐   ┌─────────────────────┐     │
│   │  tenants    │   │  documents    │   │  document_chunks    │     │
│   │  (uuid pk)  │◀──│  tenant_id fk │◀──│  tenant_id fk       │     │
│   │             │   │  hash UNIQ    │   │  embedding vector   │     │
│   │             │   │  (tenant_id,  │   │  HNSW(<=>)          │     │
│   │             │   │   content_hash)│   │  idx tenant_id     │     │
│   └─────────────┘   └───────────────┘   └─────────────────────┘     │
│                                                                     │
│                       ┌───────────────────────┐                     │
│                       │ chat_interactions     │                     │
│                       │ tenant_id fk          │                     │
│                       │ sources jsonb         │                     │
│                       │ latency_ms / cost_usd │                     │
│                       └───────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────┘
                           ▲
                           │ insertOnly (não há SELECT global aqui)
                           │
┌─────────────────────────────────────────────────────────────────────┐
│                            INGESTÃO (CLI)                           │
│   src/scripts/ingest.ts                                             │
│    └─ server/ingest/ingestor.ts                                     │
│        ├─ parsers (PDF/DOCX/XLSX/MD/TXT)                            │
│        ├─ sha256(content) → idempotência                            │
│        ├─ chunker (tiktoken + overlap)                              │
│        ├─ ai/embeddings.generateEmbeddings (batch)                  │
│        └─ db.transaction: INSERT documents + document_chunks        │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AI PROVIDER (OpenAI-compat)                    │
│                                                                     │
│  baseURL: OPENAI_COMPATIBLE_BASE_URL                                │
│  - POST /embeddings   (text-embedding-3-small / 1536)               │
│  - POST /chat/completions (gpt-4o-mini)                             │
└─────────────────────────────────────────────────────────────────────┘
```

## Sequência: pergunta de um colaborador

```
user ─▶ ChatPanel.handleSubmit
      ─▶ fetch /api/chat { tenant, question }
                              │
                              ▼
                         CORS + Zod
                              │
                              ▼
                         runChat()
                              │
                              ├─▶ resolveTenant("aurora")  ─▶ Tenant{ id }
                              │
                              ├─▶ embeddings.create(question) ─▶ vector
                              │
                              ├─▶ SQL:
                              │   SELECT ... FROM document_chunks c
                              │   JOIN documents d ON d.id = c.document_id
                              │                   AND d.tenant_id = $tenantId
                              │   WHERE c.tenant_id = $tenantId
                              │   ORDER BY embedding <=> $vec LIMIT 5
                              │
                              ├─▶ chat.completions.create(system, ctx, q)
                              │
                              ├─▶ INSERT chat_interactions(...)
                              │
                              ▼
                       JSON { answer, sources, latency, cost }
```

## Sequência: ingestão

```
$ npm run ingest -- --docs-dir ../documentos
  │
  ▼
ingestDirectory(rootDir)
  │
  ▼
for each subfolder:
    tenantConfig = getTenantConfigByFolder(name)
    tenant       = getOrCreateTenant(slug)
    for each .pdf .docx .xlsx .md .txt:
        hash = sha256(content)
        if exists(tenant.id, hash): skip
        text = parse(file)
        chunks = chunkText(text, tokens=500, overlap=80)
        vectors = embedAll(chunks)
        BEGIN
          INSERT documents (...)
          INSERT document_chunks[] (...)
        COMMIT
```
