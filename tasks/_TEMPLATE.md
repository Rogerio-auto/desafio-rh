---
id: TEMPLATE
title: Título curto e imperativo (ex "Criar middleware authenticate")
phase: F0           # F0, F1, F2, ... conforme topologia do projeto
task_ref: null      # referência opcional em docs/ (ex docs/tasks.md#TX.X)
status: available   # available | blocked | claimed | in-progress | review | done | cancelled
priority: medium    # low | medium | high | critical
estimated_size: S   # XS | S | M | L (volume de mudança, não tempo)
agent_id: null
claimed_at: null
completed_at: null
pr_url: null
depends_on: []      # lista de IDs de slots
blocks: []          # IDs que este slot desbloqueia (informativo)
source_docs:
  - docs/...
---

# <SLOT-ID> — <Título>

## Objetivo

Uma frase clara explicando o resultado pretendido em termos de capacidade entregue (não em termos de "criar arquivo X").

## Contexto

Por que este slot existe, o que ele desbloqueia, qual o trecho da doc que o origina.

## Escopo (faz)

- Bullet 1 — ação concreta.
- Bullet 2 — ação concreta.

## Fora de escopo (NÃO faz)

- Listar tudo que pode parecer relacionado mas pertence a outro slot.

## Arquivos permitidos (`files_allowed`)

Caminhos que este slot pode criar ou modificar.

- `path/to/dir/**`
- `path/to/specific/file.ts`

## Arquivos proibidos (`files_forbidden`)

Caminhos que NÃO podem ser tocados (mesmo se "fizer sentido").

- `path/to/shared.ts` (outro slot é dono)

## Contratos de entrada

O que precisa existir antes (já garantido por `depends_on`, mas explicite o contrato concreto).

## Contratos de saída

O que este slot DEVE entregar para os dependentes consumirem (assinaturas de funções, schemas, endpoints, eventos).

## Definition of Done

- [ ] Código implementado conforme escopo
- [ ] Lint verde
- [ ] Typecheck verde
- [ ] Testes verdes (incluindo testes novos do slot)
- [ ] Validação de schema nas bordas — se aplicável
- [ ] Eventos via outbox testados — se aplicável
- [ ] Audit log aplicado — se aplicável
- [ ] Logs com correlation_id — se aplicável
- [ ] PR aberto com checklist preenchida e link para o slot

## Validação

Bloco lido por `slot.py validate`. Liste comandos shell em code fences:

```powershell
pnpm --filter @<pkg>/<mod> typecheck
pnpm --filter @<pkg>/<mod> test
```

## Notas para o agente

- Convenções específicas, gotchas conhecidos, exemplos.
