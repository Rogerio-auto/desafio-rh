---
name: open-pr
description: Abre PR via gh com título e body derivados do frontmatter + seções do slot. Substitui escrever PR description à mão.
---

# /open-pr <SLOT-ID>

```powershell
python scripts/slot.py pr open <SLOT-ID>
```

## O que faz

1. Pega frontmatter do slot (id, title, depends_on, etc).
2. Extrai seções relevantes do corpo (Objetivo, Escopo, DoD).
3. Monta body do PR:
   ```
   ## <slot-id> — <title>
   <objetivo>

   ## Escopo
   ...

   ## Definition of Done
   - [x] ...
   ```
4. Invoca `gh pr create` com a base correta e a branch atual.

## Flags

- `--draft` — abre como draft.
- `--base <branch>` — base diferente de `main`.

## Pré-condições

- `gh` autenticado.
- Branch já pushada (rode `git push origin feat/<slot-id>` antes).
- Slot em status `review`.

## Quando usar

- Após `finish` + push.
- Quando o orquestrador automatiza o ciclo completo até merge.

## Alternativa

Abrir PR à mão com `gh pr create` ou pela UI do GitHub. Mas pra slots padrão do sistema, este comando é mais rápido e padroniza o body.
