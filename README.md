# Agente de IA para Dúvidas Internas de RH

Sistema multi-tenant (NorteVerde, Aurora, Vitalys) que responde dúvidas
internas de Recursos Humanos com base exclusivamente nos documentos da
empresa do colaborador. RAG sobre PostgreSQL + pgvector, com Next.js 15 e
TypeScript de ponta a ponta.

> **Resumo da promessa**
>
> - Cada empresa só recebe respostas baseadas no seu próprio acervo.
> - Toda query vetorial é forçada a filtrar por `tenant_id`.
> - Toda interação é logada em JSON estruturado com latência e custo estimado.
> - Reinquerimento idempotente: re-rodar a ingestão não duplica nada.
> - Sem secrets no repositório, segurança configurada desde o primeiro arquivo.

---

## Sumário

- [Stack](#stack)
- [Pré-requisitos](#pré-requisitos)
- [PostgreSQL local + pgvector](#postgresql-local--pgvector)
- [Subindo o projeto](#subindo-o-projeto)
- [Scripts disponíveis](#scripts-disponíveis)
- [Estrutura](#estrutura)
- [API](#api)
- [Ingestão](#ingestão)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Custos](#custos)
- [Segurança](#segurança)
- [Solução de problemas](#solução-de-problemas)

---

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Runtime | Node.js ≥ 20 | LTS estável, ecossistema de parsers maduro. |
| Framework | Next.js 15 (App Router) | UI + API routes + server actions em um único projeto TS. |
| Linguagem | TypeScript strict | Tipos no domínio, no schema e nos contratos da API. |
| Banco | PostgreSQL 15+ local | Maduro, relacional, suporta `pgvector`. |
| ORM | Drizzle | TS-first, SQL transparente, migrations versionadas. |
| Vetores | pgvector | Mantém isolamento por tenant via SQL, evita banco extra. |
| Validação | Zod | Schemas reutilizáveis no handler e na UI. |
| LLM | Cliente OpenAI-compatible | Funciona com OpenAI, OpenRouter, Groq, Azure etc. |
| Logs | Pino | JSON estruturado, redação automática de segredos. |
| Testes | Vitest | Rápido, ESM-nativo, alinhado com TS. |

---

## Pré-requisitos

- Node.js ≥ 20.18 (`node --version`)
- npm ≥ 10 (`npm --version`)
- PostgreSQL ≥ 15 rodando em `localhost:5432`
- Extensão `pgvector` disponível no servidor Postgres (ver próxima seção)
- Acesso a uma API compatível com OpenAI (`OPENAI_COMPATIBLE_*`)

---

## PostgreSQL local + pgvector

O sistema usa a extensão `pgvector` para armazenar e buscar embeddings. A
extensão precisa estar **instalada no servidor Postgres** (não basta uma
dependência npm).

### 1. Criar o banco

```sql
CREATE DATABASE desafio;
```

Em seguida, conecte-se ao novo banco e habilite a extensão:

```sql
\c desafio
CREATE EXTENSION IF NOT EXISTS vector;
```

Ou, equivalente, pelo terminal:

```bash
psql -U postgres -c "CREATE DATABASE desafio;"
psql -U postgres -d desafio -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Você também pode rodar `npm run db:enable-pgvector` (ver abaixo) — o script
detecta se a extensão está disponível e, se sim, habilita.

### 2. Instalar `pgvector` no Windows

> Se você está em PostgreSQL ≥ 16 no Linux/macOS, geralmente é só instalar
> o pacote `postgresql-XX-pgvector` da sua distro. No Windows, requer build.

1. Instale o **"Build Tools for Visual Studio"** com o workload
   *Desktop development with C++* (necessário para `nmake` e MSVC).
2. Abra o **x64 Native Tools Command Prompt for VS 2022**.
3. Configure as variáveis e construa:
   ```cmd
   set "PGROOT=C:\Program Files\PostgreSQL\18"
   cd %TEMP%
   git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git
   cd pgvector
   nmake /F Makefile.win
   nmake /F Makefile.win install
   ```
4. Reinicie o serviço PostgreSQL (`Restart-Service postgresql-x64-18`) e
   rode `npm run db:enable-pgvector`.

Outra opção em ambientes Docker: usar a imagem oficial
`pgvector/pgvector:pg16` no `docker-compose`, mas o requisito do projeto
é Postgres local.

### 3. Verificar

```bash
npm run db:enable-pgvector
```

Saída esperada (extensão presente):
```json
{"level":"info","msg":"pgvector_enabled","version":"0.8.0"}
```

Se a extensão **não estiver disponível** no servidor:
```json
{"level":"error","msg":"pgvector_not_available_on_server: install pgvector ..."}
```

---

## Subindo o projeto

```bash
# 1. Instale dependências
npm install

# 2. Copie e ajuste o env
cp .env.example .env       # ou: copy .env.example .env   (Windows CMD)
# edite .env: DATABASE_URL e OPENAI_COMPATIBLE_API_KEY

# 3. Habilite pgvector (uma vez)
npm run db:enable-pgvector

# 4. Rode migrations
npm run db:migrate

# 5. Crie os tenants
npm run db:seed

# 6. Ingerir documentos (opção A — linha de comando)
npm run ingest -- --docs-dir ../documentos

# 6b. Ingerir documentos (opção B — via UI)
#   Suba a UI e use a seção "Gerenciar documentos" para fazer upload
#   de arquivos individuais pelo browser. Formatos aceitos: PDF, DOCX,
#   XLSX, MD, TXT (até MAX_UPLOAD_SIZE_MB, padrão 10 MB).

# 7. Suba a UI
npm run dev
# abrir http://localhost:3000
```

> O parâmetro `--docs-dir` aceita caminhos relativos. Os documentos
> originais ficam em `../documentos/` (lado a lado com este diretório
> `Elemento/`), por isso o exemplo aponta para `..`. Se você quiser
> mover, é só copiar a pasta para dentro do projeto.

---

## Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe Next.js em modo desenvolvimento (http://localhost:3000). |
| `npm run build` | Build de produção do Next.js. |
| `npm start` | Sobe o build de produção. |
| `npm run lint` | Roda o ESLint (next/typescript). |
| `npm run format` / `format:check` | Prettier sobre `src/` e `tests/`. |
| `npm test` | Vitest (suíte completa, sem rede). |
| `npm run test:watch` | Vitest em modo watch. |
| `npm run db:generate` | Gera novas migrations Drizzle a partir do schema. |
| `npm run db:migrate` | Aplica migrations na base configurada. |
| `npm run db:seed` | Cria/atualiza os tenants iniciais. |
| `npm run db:enable-pgvector` | Verifica e habilita a extensão `vector`. |
| `npm run ingest -- --docs-dir <path>` | Ingere documentos de cada tenant. |

---

## Estrutura

```
Elemento/
├── README.md                # este arquivo
├── ARCHITECTURE.md          # mapa do sistema, escolhas e trade-offs
├── CLAUDE.md                # contrato de qualidade do projeto
├── adr/                     # Architecture Decision Records
├── docs/                    # diagramas e notas
├── logs-exemplo/            # amostras de logs estruturados
├── src/
│   ├── app/                 # Next.js App Router (UI + rotas)
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── api/
│   │       ├── chat/route.ts
│   │       └── health/route.ts
│   ├── components/          # React (UI)
│   ├── server/              # tudo que só roda no servidor
│   │   ├── ai/              # cliente LLM, embeddings, custo
│   │   ├── db/              # schema, client e migrations Drizzle
│   │   ├── ingest/          # parsers e pipeline de ingestão
│   │   ├── logging/         # logger Pino com redaction
│   │   ├── rag/             # chunker, retriever, pipeline RAG
│   │   ├── security/        # CORS, validação Zod
│   │   └── tenants/         # config canônico e service
│   ├── lib/                 # utilidades (env loader, env schema)
│   └── scripts/             # entrypoints CLI (migrate, seed, ingest)
└── tests/                   # Vitest
```

---

## API

### `POST /api/chat`

```json
{
  "tenant": "norteverde",
  "question": "Como funciona a política de férias?"
}
```

Resposta:

```json
{
  "answer": "De acordo com a NorteVerde ...",
  "sources": [
    { "fileName": "Politica_Ferias_v2.docx", "chunkId": "uuid", "similarity": 0.81 }
  ],
  "latencyMs": 1342,
  "estimatedCostUsd": 0.000418,
  "retrievedCount": 3
}
```

Erros:

| Status | Quando |
|---|---|
| 400 | Payload inválido (Zod) |
| 403 | Origin não permitido |
| 404 | Tenant desconhecido |
| 500 | Erro interno (sem vazar detalhes para o cliente) |

### `POST /api/documents`

Faz upload e ingere um documento para um tenant. Aceita `multipart/form-data`.

| Campo (form) | Tipo | Descrição |
|---|---|---|
| `tenant` | `string` | Slug do tenant (`norteverde`, `aurora`, `vitalys`) |
| `file` | `File` | Arquivo a ingerir. Formatos: PDF, DOCX, XLSX, MD, TXT |

Resposta de sucesso (`200`):

```json
{
  "documentId": "uuid",
  "status": "ready",
  "chunks": 14
}
```

Resposta de duplicata (`200`):

```json
{ "status": "duplicate" }
```

Erros:

| Status | Quando |
|---|---|
| 400 | Tenant ausente, inválido ou arquivo ausente |
| 413 | Arquivo excede `MAX_UPLOAD_SIZE_MB` |
| 415 | Formato de arquivo não suportado |
| 500 | Erro interno de parsing ou embedding |

### `GET /api/documents`

Lista documentos de um tenant com paginação por cursor.

Query params:

| Param | Obrigatório | Descrição |
|---|---|---|
| `tenant` | sim | Slug do tenant |
| `cursor` | não | Cursor opaco da página anterior |

Resposta (`200`):

```json
{
  "items": [
    {
      "id": "uuid",
      "fileName": "politica-ferias.pdf",
      "mimeType": "application/pdf",
      "status": "ready",
      "error": null,
      "processedAt": "2026-06-01T20:00:00.000Z",
      "createdAt": "2026-06-01T19:59:50.000Z"
    }
  ],
  "nextCursor": null
}
```

Valores possíveis de `status`: `queued` | `processing` | `ready` | `failed`.

### `GET /api/health`

Retorna `200` quando consegue um `SELECT 1` no Postgres. Inclui também a
versão do `pgvector` (ou `"missing"`).

---

## Ingestão

O comando `npm run ingest -- --docs-dir <path>`:

1. Lê cada subpasta de `docs-dir`.
2. Mapeia o nome da subpasta para um slug canônico via
   `src/server/tenants/config.ts` (suporta as pastas reais do challenge:
   `nortverde-logistica`, `construtora-aurora`, `vitalys-saude`).
3. Para cada arquivo `.pdf | .docx | .xlsx | .md | .txt`:
   - calcula `sha256(content)`,
   - se já existe `(tenant_id, content_hash)`, pula (idempotência),
   - extrai texto, divide em chunks (tiktoken + overlap),
   - gera embeddings em batch via API compatível com OpenAI,
   - grava `documents` + `document_chunks` numa transação.
4. Loga um sumário JSON por tenant.

Re-rodar o comando não duplica nada.

---

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste os valores. As principais variáveis:

| Variável | Default | Descrição |
|---|---|---|
| `DATABASE_URL` | — | URL de conexão ao Postgres (requerida) |
| `OPENAI_COMPATIBLE_BASE_URL` | `https://api.openai.com/v1` | Base URL da API compatível com OpenAI |
| `OPENAI_COMPATIBLE_API_KEY` | — | Chave da API (requerida) |
| `LLM_MODEL` | `gpt-4o-mini` | Modelo de linguagem para geração de respostas |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Modelo para geração de embeddings |
| `EMBEDDING_DIMENSIONS` | `1536` | Dimensão dos vetores (deve coincidir com o modelo) |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Origins permitidas no CORS (nunca `*`) |
| `MAX_QUESTION_LENGTH` | `2000` | Limite de caracteres por pergunta |
| `MAX_UPLOAD_SIZE_MB` | `10` | Tamanho máximo de arquivo para upload via UI (MB) |
| `RAG_TOP_K` | `5` | Número de chunks recuperados por consulta |
| `LOG_LEVEL` | `info` | Nível de log Pino (`debug`, `info`, `warn`, `error`) |

Veja `.env.example` para a lista completa com comentários.

---

## Custos

Premissas e fórmula em [ARCHITECTURE.md › Custos](./ARCHITECTURE.md#custos).
Resumo para 15 000 perguntas/mês (5 000 por empresa × 3 empresas) com
`gpt-4o-mini` + `text-embedding-3-small`:

| Item | Tokens estimados / pergunta | Custo / pergunta |
|---|---:|---:|
| Embedding da pergunta | 20 | ~US$ 0,0000004 |
| Prompt do LLM (sys + contexto + pergunta) | 1 500 | ~US$ 0,000225 |
| Resposta do LLM | 200 | ~US$ 0,00012 |
| **Total** | | **~US$ 0,000346** |

Mensal: **~US$ 5,19** para 15 000 perguntas. Os preços vêm do `.env`,
então trocar para outro provedor é só editar três variáveis.

---

## Segurança

- `.env` no `.gitignore`, `.env.example` apenas com placeholders.
- Logs estruturados com redação automática de chaves (`OPENAI_*`,
  `DATABASE_URL`, etc.).
- CORS configurável (`ALLOWED_ORIGINS`), nunca `*` por padrão.
- Headers de segurança configurados no `next.config.ts`.
- Validação de payload com Zod e limite de tamanho de pergunta.
- A única função pública de busca vetorial recebe um `Tenant` resolvido,
  não uma string — eliminando "querys sem `tenant_id`" no nível do tipo.
- Build/Docker: caso adicione Dockerfile, há `.dockerignore` pronto;
  use multi-stage e usuário não-root (`/hm-init`).

Detalhes em [adr/002-isolamento-multi-tenant.md](./adr/002-isolamento-multi-tenant.md).

---

## Solução de problemas

- **"pgvector_not_available_on_server"**: a extensão não está instalada
  no Postgres. Veja [PostgreSQL local + pgvector](#postgresql-local--pgvector).
- **`drizzle-kit`: "DATABASE_URL is required"**: confira que o `.env`
  existe na raiz do projeto e contém `DATABASE_URL=`.
- **Senha com caractere especial**: percent-encode `@` como `%40`,
  `:` como `%3A`, etc.
- **`/api/chat` retorna 500 sobre embeddings**: confirme
  `OPENAI_COMPATIBLE_API_KEY` e que `LLM_MODEL` / `EMBEDDING_MODEL`
  existem no provedor configurado.
