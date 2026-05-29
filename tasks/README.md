# Tasks — Sistema de slots para agentes IA

Este projeto é desenvolvido por agentes IA em paralelo. Cada unidade de trabalho é um **slot**: uma cápsula com escopo fechado, dependências explícitas, contratos de entrada/saída e Definition of Done verificável.

## Como funciona

```
   ┌─────────────┐  pega slot   ┌─────────────┐  abre PR    ┌─────────────┐
   │  available  │─────────────▶│ in-progress │────────────▶│   review    │
   └─────────────┘              └─────────────┘             └──────┬──────┘
                                                                   │ aprovado
                                                                   ▼
                                                            ┌─────────────┐
                                                            │    done     │
                                                            └─────────────┘
```

1. Agente lê [PROTOCOL.md](PROTOCOL.md) na primeira vez (sempre).
2. Agente lê [STATUS.md](STATUS.md) para ver o board (ou usa `slot.py status`).
3. Escolhe um slot com status `available` cujas `depends_on` estejam `done`.
4. Atualiza o frontmatter do slot para `in-progress` com seu `agent_id` e `claimed_at` (via `slot.py claim`).
5. Cria branch `feat/<slot-id>-<slug>` (via `slot.py claim`).
6. Executa **somente** o que está no escopo do slot.
7. Roda os comandos de validação listados (`slot.py validate`).
8. Commita o código + roda `slot.py finish` → push da branch.
9. Após merge, `slot.py reconcile-merged --write` marca como `done`.

## Estrutura

```
tasks/
├── PROTOCOL.md           # regras invioláveis. Leia sempre.
├── README.md             # este arquivo
├── STATUS.md             # board com todos os slots e estados (view derivada)
├── _TEMPLATE.md          # template para criar novos slots
├── slot.config.json      # config opcional (specialists, phases, migrations)
└── slots/
    ├── F0/               # Fundação (setup, infra base)
    ├── F1/               # Próxima fase
    └── ...               # F2, F3, ... conforme o projeto
```

## Granularidade

Cada slot é dimensionado para ser executável por **um agente em uma única sessão de trabalho**, sem precisar tocar em arquivos de outros slots em paralelo. Quando uma feature é grande demais, ela vira múltiplos slots ligados por `depends_on`.

## Convenções de ID

`<FASE>-S<NN>-<slug>` — ex: `F1-S03-auth-jwt-tokens`.

- `<FASE>` = `F0`, `F1`, `F2`, ...
- `<NN>` = ordem dentro da fase (sequencial, com lacunas reservadas)
- `<slug>` = kebab-case, descritivo

## Estados

| Estado        | Significado                                    |
| ------------- | ---------------------------------------------- |
| `available`   | Pronto para ser pego (dependências resolvidas) |
| `blocked`     | Aguardando dependência                         |
| `claimed`     | Reservado por um agente                        |
| `in-progress` | Agente trabalhando                             |
| `review`      | PR aberto, aguardando revisão                  |
| `done`        | Mergeado em main                               |
| `cancelled`   | Descartado (com justificativa)                 |

## Comandos canônicos

```powershell
python scripts/slot.py status                       # resumo do board
python scripts/slot.py list-available               # slots prontos
python scripts/slot.py plan-batch --max 3 --json    # decide batch paralelo em 1 call
python scripts/slot.py brief <SLOT-ID> --json       # briefing self-contained do slot
python scripts/slot.py claim   <SLOT-ID>            # reserva + branch + frontmatter + commit chore
python scripts/slot.py validate <SLOT-ID>           # roda bloco Validação do slot
python scripts/slot.py finish  <SLOT-ID>            # frontmatter review + commit chore
python scripts/slot.py auto-review <SLOT-ID> --json # pré-relatório de grep determinístico
python scripts/slot.py reconcile-merged --write     # pós-merge: marca slots done
python scripts/slot.py worktree-clean               # pós-merge: limpa worktrees stale
```

## Documentação fonte

Cada slot referencia explicitamente o trecho da documentação que o origina, em `source_docs`. Em caso de conflito entre slot e doc, **a doc vence** — abrir issue para corrigir o slot.
