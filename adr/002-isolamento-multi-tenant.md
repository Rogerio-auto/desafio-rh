# ADR 002 — Isolamento multi-tenant (defesa em camadas)

- **Status:** Aceito
- **Data:** 2026-05-28

## Problema

Vazamento entre tenants é a falha crítica do sistema (PRD §4.3). Um
colaborador de uma empresa **nunca** pode receber resposta apoiada em
documento de outra. O sistema precisa garantir isso por design, não por
revisão.

## Contexto e restrições

- Modelo single-database / single-schema: todos os tenants compartilham
  o mesmo Postgres.
- A v1 não tem autenticação real (PRD §4) — o tenant chega via payload.
  Em produção, viria do token de identidade.
- Toda nova feature pode introduzir uma query que se esqueça do filtro.

## Opções consideradas

1. **Defesa única na função de retrieval** (filtro no SQL).
   - Mínimo viável. Fácil de esquecer ao criar uma segunda função.
2. **Database por tenant** (schema or DB).
   - Isolamento físico. Inviável operacionalmente para 3 tenants
     dinâmicos e a meta de "novo cliente sem reprovisionar infra".
3. **Row-Level Security (RLS) do Postgres**.
   - Forte; exige `SET tenant_id = $` por conexão e papel próprio.
     Em projetos com Drizzle + pool, vira fonte de bugs ("conexão
     reciclada com tenant errado").
4. **Defesa em camadas: tipo + SQL + schema + teste**.
   - Mais robusto sem adicionar acoplamento operacional.

## Decisão

Adotar **defesa em camadas**:

1. **Camada de tipos** — `retrieveChunks` aceita `Tenant`
   (resultado de `resolveTenant`), nunca uma string. Mudar isso quebra
   compilação.
2. **Camada de SQL** — `WHERE c.tenant_id = $1 AND d.tenant_id = $1`
   literal e parametrizado, em **uma** função canônica
   (`src/server/rag/retriever.ts`).
3. **Camada de schema** — FK obrigatória para `tenants.id`, `ON DELETE
   CASCADE`, índices em `tenant_id` e UNIQUE `(tenant_id, content_hash)`.
4. **Camada de teste** — `tests/unit/retrieval-isolation.test.ts` prova
   que três tenants com a mesma query nunca retornam dados cruzados.
   `tests/unit/retriever-contract.test.ts` falha em compilação se a
   assinatura aceitar string.

A v1 **não** adota RLS, mas o schema deixa o caminho aberto: como toda
tabela carrega `tenant_id`, ativar RLS no futuro é uma migration.

## Consequências aceitas

- Custo: nenhum.
- Risco residual: alguém criar uma segunda função de busca vetorial fora
  de `rag/retriever.ts`. Mitigado por CLAUDE.md ("Não fazer") + revisão.
- Em produção real, plugar autenticação e derivar o tenant **do token**,
  ignorando o payload — passo documentado no README e ARCHITECTURE.
