# CLAUDE.md — Padrão de qualidade do projeto

Este arquivo define o **contrato de qualidade** para qualquer trabalho
futuro neste repositório, humano ou agente IA. Lê antes de qualquer PR.

---

## Princípio

World-class. Em todas as camadas. Inegociável.

- Toda escolha técnica é a melhor escolha — não a popular, não a padrão.
- Segurança não é fase. É fundação.
- Performance não é otimização futura. É restrição de design.
- O primeiro commit definiu o padrão. Não regrida.

---

## Não fazer

- **Não quebrar isolamento multi-tenant.** Toda query que toca
  `document_chunks`, `documents` ou `chat_interactions` precisa filtrar
  por `tenant_id`. A única função pública de busca vetorial vive em
  `src/server/rag/retriever.ts` e recebe `Tenant`, não string. Se
  precisar de uma segunda função de busca vetorial, *recue e converse*.
- **Não inventar resposta sem fonte.** O system prompt em
  `src/server/ai/chat.ts` obriga a frase canônica
  "Não encontrei evidência documental suficiente para responder com
  segurança." quando o contexto for vazio. Não relaxar isso.
- **Não logar segredos.** O `logger` já redata chaves comuns; ao
  adicionar uma chave nova, atualizar `SENSITIVE_KEYS`.
- **Não commitar `.env`.** Está no `.gitignore`. Se for adicionar uma
  variável nova, atualizar **também** o `.env.example` com placeholder.
- **Não usar `*` em CORS.** O default é `ALLOWED_ORIGINS=http://localhost:3000`;
  produção precisa de domínios explícitos.
- **Não adicionar dependências sem justificar.** Cada dependência paga
  um custo de manutenção e segurança. Use o framework de decisão da
  skill `/hm-init`.

---

## Sempre fazer

- **Migrations versionadas.** Toda mudança de schema é uma migration
  Drizzle gerada via `npm run db:generate`. Nunca editar
  `src/server/db/migrations/*.sql` à mão depois de aplicado em algum
  ambiente.
- **Testes para regressão de isolamento.** Qualquer alteração na
  retriever, no schema ou na resolução de tenant precisa rodar
  `tests/unit/retrieval-isolation.test.ts` + `tests/unit/retriever-contract.test.ts`.
- **Validação Zod no payload da API.** Não confiar em `JSON.parse`.
- **Estimar custo.** Toda nova chamada a LLM precisa contabilizar tokens
  e atualizar `estimateCostUsd`.

---

## Convenções

- **TypeScript strict + `noUncheckedIndexedAccess`.** Trate `xs[0]` como
  `T | undefined`.
- **Pasta `server/` é privada do servidor.** Não importar de `app/` ou
  `components/`.
- **Drizzle como contrato.** A verdade do schema vive em
  `src/server/db/schema.ts`; o resto deriva tipos dali.
- **Comentários só para o "porquê não-óbvio".** Não comente o quê.
- **Português nas respostas ao usuário; código em inglês.**

---

## Como rodar (resumo)

```bash
npm install
npm run db:enable-pgvector
npm run db:migrate
npm run db:seed
npm run ingest -- --docs-dir ../documentos
npm run dev
```

Detalhes completos em `README.md`. Decisões arquiteturais em `adr/`.

---

## Sistema de tasks

- `tasks/PROTOCOL.md` é lei. `tasks/STATUS.md` é o board (view derivada).
- Slots em `tasks/slots/F<n>/`. Use `python scripts/slot.py` para tudo.
- NUNCA edite `STATUS.md` à mão. NUNCA `checkout -b` manual.
- Agentes hierárquicos em `.claude/agents/` — orchestrator delega.
- Para decompor uma feature em slots, rode `/hm-tasks`.
