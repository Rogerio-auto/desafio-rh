# PRD — Agente de IA para Dúvidas Internas de RH

## 1. Visão geral

O projeto é um sistema web multi-tenant para atendimento automatizado de dúvidas internas de RH usando IA generativa com recuperação de contexto documental.

Cada empresa cliente possui sua própria base de documentos internos. O sistema deve permitir que colaboradores façam perguntas em português e recebam respostas baseadas exclusivamente nos documentos da sua própria empresa.

O sistema será desenvolvido como uma aplicação full-stack em **Next.js + Node.js + TypeScript**, usando **PostgreSQL local** como banco de dados, **Drizzle ORM** para modelagem e migrations, e **Tailwind CSS** para interface.

---

## 2. Problema

As empresas clientes possuem alto volume de dúvidas repetitivas de RH, hoje respondidas manualmente por e-mail, WhatsApp ou sistemas internos.

Essas dúvidas incluem temas como:

- Férias
- Benefícios
- Plano de saúde
- Home office
- Reembolso de cursos
- Escalas
- Conduta
- Segurança do trabalho
- Políticas internas

O tempo médio de resposta atual varia entre 6 e 48 horas. O objetivo é reduzir esse tempo para poucos segundos, mantendo rastreabilidade, segurança e isolamento entre empresas.

---

## 3. Objetivos do produto

### Objetivos principais

1. Permitir que colaboradores façam perguntas em linguagem natural.
2. Responder com base nos documentos internos da empresa correta.
3. Garantir isolamento total entre tenants.
4. Registrar logs estruturados de todas as interações.
5. Permitir ingestão idempotente dos documentos de cada empresa.
6. Rodar localmente no computador do desenvolvedor usando PostgreSQL local.
7. Documentar arquitetura, decisões técnicas e custos estimados.

---

## 4. Fora de escopo inicial

Na primeira versão, não é necessário:

- Autenticação real com login corporativo.
- Integração com Slack, Teams ou WhatsApp.
- Painel administrativo completo.
- Upload de documentos pela UI.
- Deploy em produção.
- Fine-tuning de modelo.
- Sistema completo de permissões por usuário.
- Suporte a múltiplos idiomas além de português.

Esses pontos podem ser adicionados em fases futuras.

---

## 5. Stack definida

### Frontend e backend

**Next.js com App Router**

Motivo: permite construir UI, API routes, server actions e fluxo full-stack em um único projeto TypeScript, reduzindo complexidade para uma entrega local e demonstrável.

### Linguagem

**TypeScript**

Motivo: melhora segurança de tipos em API, domínio, schema de banco e contratos entre frontend/backend.

### Runtime

**Node.js**

Motivo: stack natural para Next.js, bom ecossistema para parsing de documentos, integração com APIs de IA e desenvolvimento rápido.

### UI

**Tailwind CSS**

Motivo: permite criar uma interface limpa, responsiva e rápida sem adicionar dependências pesadas de design system.

### Banco

**PostgreSQL local do computador**

Motivo: banco maduro, confiável, com suporte a dados relacionais e extensão vetorial via `pgvector`.

### ORM

**Drizzle ORM**

Motivo: ORM leve, TypeScript-first, bom controle sobre SQL, migrations e schemas explícitos.

### Vetores

**pgvector no PostgreSQL**

Motivo: evita adicionar um banco vetorial separado, reduz custo operacional e facilita isolamento por tenant via SQL.

### IA

**Cliente compatível com OpenAI API**

Motivo: permite usar OpenAI, OpenRouter, Groq, Together, Azure OpenAI ou outro provedor compatível alterando variáveis de ambiente.

---

## 6. Usuários

### Colaborador

Pessoa que faz perguntas sobre políticas internas da empresa.

Exemplo:

> “Como funciona o reembolso de cursos?”

### RH / administrador

Pessoa interessada em reduzir volume de dúvidas repetitivas e consultar logs de uso.

Na primeira versão, o papel de administrador será representado apenas por dados e logs, sem painel completo.

### Desenvolvedor / avaliador

Pessoa que irá rodar o projeto localmente, ingerir documentos e validar o comportamento multi-tenant.

---

## 7. Tenants iniciais

O sistema deve suportar três tenants iniciais:

| Slug | Empresa |
|---|---|
| `norteverde` | NorteVerde Logística S.A. |
| `aurora` | Construtora Aurora Engenharia Ltda. |
| `vitalys` | Vitalys Saúde S.A. |

O slug será usado nas APIs, ingestão, banco e interface.

---

## 8. Estrutura esperada de documentos

A pasta local de documentos deve seguir este formato:

```text
documentos/
├── norteverde/
├── aurora/
└── vitalys/
```

Formatos suportados na v1:

- `.pdf`
- `.docx`
- `.xlsx`
- `.md`
- `.txt`

---

## 9. Funcionalidades

## 9.1 Ingestão de documentos

O sistema deve ter um comando de ingestão via Node.js/TypeScript.

Exemplo:

```bash
npm run ingest -- --docs-dir ./documentos
```

ou:

```bash
pnpm ingest --docs-dir ./documentos
```

A ingestão deve:

1. Ler os documentos dentro de cada pasta de tenant.
2. Detectar o tenant pelo nome da subpasta.
3. Extrair texto dos arquivos.
4. Calcular hash do arquivo ou conteúdo.
5. Evitar duplicação se o mesmo arquivo já tiver sido ingerido.
6. Criar registros de documentos.
7. Dividir textos em chunks.
8. Gerar embeddings.
9. Salvar chunks e embeddings no PostgreSQL.
10. Registrar logs de ingestão.

### Critério de aceite

Rodar a ingestão duas vezes não pode duplicar documentos nem chunks.

---

## 9.2 Chat web

A aplicação deve ter uma interface web simples em Next.js.

A tela principal deve conter:

- Seletor de empresa/tenant.
- Campo de pergunta.
- Botão para enviar.
- Área de resposta.
- Lista de fontes consultadas.
- Estado de carregamento.
- Mensagem de erro amigável.

Exemplo de fluxo:

1. Usuário seleciona `NorteVerde`.
2. Digita: “Como funcionam as férias?”
3. Sistema consulta apenas documentos da NorteVerde.
4. Sistema responde em português.
5. Sistema lista arquivos usados como fonte.

---

## 9.3 API de chat

Criar endpoint:

```http
POST /api/chat
```

Payload:

```json
{
  "tenant": "norteverde",
  "question": "Como funciona a política de férias?"
}
```

Resposta:

```json
{
  "answer": "De acordo com os documentos da NorteVerde...",
  "sources": [
    {
      "fileName": "politica-ferias.pdf",
      "chunkId": "..."
    }
  ],
  "latencyMs": 1234,
  "estimatedCostUsd": 0.00042
}
```

### Regras

- `tenant` é obrigatório.
- `question` é obrigatório.
- O sistema nunca pode buscar documentos sem filtro por tenant.
- A resposta deve ser em português.
- Se não houver contexto suficiente, o sistema deve dizer que não encontrou evidência documental suficiente.
- Não pode inventar políticas.
- Deve citar os arquivos usados.

---

## 9.4 Recuperação de contexto

O fluxo RAG deve funcionar assim:

1. Receber pergunta.
2. Validar tenant.
3. Gerar embedding da pergunta.
4. Buscar chunks similares no PostgreSQL usando `pgvector`.
5. Aplicar filtro obrigatório por `tenant_id`.
6. Selecionar top K chunks mais relevantes.
7. Montar prompt com contexto.
8. Chamar modelo de linguagem.
9. Retornar resposta com fontes.

Parâmetros configuráveis via `.env`:

```env
RAG_TOP_K=5
RAG_MIN_SCORE=0.7
LLM_MODEL=...
EMBEDDING_MODEL=...
```

---

## 9.5 Isolamento multi-tenant

Esse é o requisito mais crítico.

O sistema deve garantir:

- Todo documento pertence a um tenant.
- Todo chunk pertence a um tenant.
- Toda query de recuperação inclui `tenant_id`.
- Não existe endpoint que permita recuperar chunks sem tenant.
- Testes automatizados devem provar que uma pergunta feita para um tenant não retorna documentos de outro tenant.

### Critério de aceite obrigatório

Um teste deve inserir documentos/chunks de dois tenants diferentes e garantir que a consulta para o tenant A nunca retorna dados do tenant B.

---

## 9.6 Logs estruturados

Toda interação de chat deve gerar log JSON com pelo menos:

```json
{
  "timestamp": "2026-05-28T12:00:00.000Z",
  "tenant": "norteverde",
  "question": "Como funciona a política de férias?",
  "documentsRetrieved": ["politica-ferias.pdf"],
  "latencyMs": 1234,
  "estimatedCostUsd": 0.00042,
  "status": "success"
}
```

Em caso de erro:

```json
{
  "timestamp": "2026-05-28T12:00:00.000Z",
  "tenant": "norteverde",
  "question": "Como funciona a política de férias?",
  "documentsRetrieved": [],
  "latencyMs": 231,
  "estimatedCostUsd": 0,
  "status": "error",
  "error": "Tenant not found"
}
```

Também criar:

```text
logs-exemplo/exemplo-interacao.jsonl
```

---

## 9.7 Healthcheck

Criar endpoint:

```http
GET /api/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "database": "ok",
  "timestamp": "..."
}
```

O healthcheck deve verificar conexão real com o PostgreSQL.

---

## 10. Modelo de dados inicial

Usando Drizzle ORM.

### Tabela `tenants`

Campos:

- `id`
- `slug`
- `name`
- `created_at`
- `updated_at`

### Tabela `documents`

Campos:

- `id`
- `tenant_id`
- `file_name`
- `file_path`
- `mime_type`
- `content_hash`
- `status`
- `created_at`
- `updated_at`

Restrição:

- `tenant_id + content_hash` deve ser único.

### Tabela `document_chunks`

Campos:

- `id`
- `tenant_id`
- `document_id`
- `chunk_index`
- `content`
- `embedding`
- `token_count`
- `created_at`

Índice obrigatório:

- índice vetorial em `embedding`
- índice por `tenant_id`
- índice por `document_id`

### Tabela `chat_interactions`

Campos:

- `id`
- `tenant_id`
- `question`
- `answer`
- `sources`
- `latency_ms`
- `estimated_cost_usd`
- `status`
- `error`
- `created_at`

---

## 11. Variáveis de ambiente

Criar `.env.example`:

```env
# App
NODE_ENV=development
APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgres://postgres:change-me-password@localhost:5432/rh_ai_agent

# CORS / Security
ALLOWED_ORIGINS=http://localhost:3000

# AI provider
OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1
OPENAI_COMPATIBLE_API_KEY=your-key-here
LLM_MODEL=gpt-4.1-mini
EMBEDDING_MODEL=text-embedding-3-small

# RAG
RAG_TOP_K=5
RAG_MIN_SCORE=0.7
MAX_CONTEXT_CHARS=12000

# Cost estimation placeholders
LLM_INPUT_COST_PER_1M_TOKENS=change-me
LLM_OUTPUT_COST_PER_1M_TOKENS=change-me
EMBEDDING_COST_PER_1M_TOKENS=change-me
```

O `.env` real nunca deve ser commitado.

---

## 12. Requisitos de segurança

Obrigatórios desde o primeiro commit:

- `.env` no `.gitignore`.
- `.env.example` sem secrets reais.
- Nenhum secret hardcoded.
- Security headers configurados.
- CORS configurável via env.
- Validação de payload com Zod.
- Sanitização básica de entrada.
- Limite de tamanho para pergunta.
- Nenhuma query vetorial sem `tenant_id`.
- Logs não devem registrar API keys.
- Dockerfile multi-stage se Docker for usado.
- `.dockerignore` obrigatório se houver Dockerfile.
- Usuário não-root no container.
- Não usar `npm run dev` no Dockerfile de produção.

---

## 13. Requisitos não funcionais

### Latência

Meta:

- P95 abaixo de 8 segundos em perguntas factuais simples em ambiente local.

### Custo

O sistema deve calcular custo estimado por interação com base em:

- Tokens de entrada.
- Tokens de saída.
- Tokens de embedding.
- Preços configurados via env.

Também documentar estimativa mensal para:

```text
5.000 perguntas/mês por empresa
3 empresas
15.000 perguntas/mês total
```

### Reprodutibilidade

O projeto deve rodar localmente com comandos documentados.

Exemplo:

```bash
npm install
npm run db:migrate
npm run db:seed
npm run ingest -- --docs-dir ./documentos
npm run dev
```

---

## 14. Testes obrigatórios

Criar testes para:

1. Ingestão idempotente.
2. Parsing de `.txt` e `.md`.
3. Chunking.
4. Validação de tenant.
5. Recuperação filtrada por tenant.
6. API `/api/chat` não retornar fontes de outro tenant.
7. Healthcheck com banco.
8. Resposta sem contexto suficiente.
9. Estimativa de custo.
10. Validação de payload com Zod.

---

## 15. Documentação obrigatória

Criar:

```text
README.md
ARCHITECTURE.md
CLAUDE.md
docs/arquitetura.md
adr/
├── 001-camada-informacao.md
├── 002-isolamento-multi-tenant.md
├── 003-modelo-linguagem.md
├── 004-recuperacao-contexto.md
└── 005-logging-observabilidade.md
```

---

## 16. Critérios finais de aceite

O projeto só é considerado pronto quando:

1. A aplicação Next.js sobe localmente.
2. O PostgreSQL local conecta corretamente.
3. As migrations Drizzle rodam.
4. Os tenants iniciais são criados.
5. A ingestão processa documentos de `/documentos`.
6. Rodar ingestão duas vezes não duplica conteúdo.
7. A tela de chat funciona.
8. A API `/api/chat` funciona.
9. As respostas citam fontes.
10. Os testes de isolamento multi-tenant passam.
11. Os logs estruturados são gerados.
12. O README explica como rodar tudo.
13. Os ADRs documentam as decisões.
14. Não há secrets no repositório.
15. `.dockerignore` existe caso Dockerfile exista.
16. O projeto nasce com fundação segura.

---