---
name: slot-reconcile
description: Pós-merge — detecta automaticamente slots cujo PR foi mergeado em main e marca como done. Idempotente.
---

# /slot-reconcile

```powershell
python scripts/slot.py reconcile-merged --write
```

## O que faz

1. **Layer 0 (fonte de verdade):** `gh pr list --state merged --json headRefName,...`. Regex `feat/(f\d+-s\d+)(?:-.*)?` extrai o slot_id.
2. **Layer 1 (fallback):** parseia título dos PRs mergeados.
3. **Layer 2 (fallback):** branches locais em `main` com commits não-chore.

Atualiza frontmatter (`status: done`, `pr_url`) + sync STATUS.md.

## Quando usar

- Imediatamente após mergear PR de slot em `main`.
- Após pull do `main` se outros usuários mergearam.
- Periodicamente — é idempotente.

## Dry-run

```powershell
python scripts/slot.py reconcile-merged
```

Mostra o que seria feito, sem escrever.

## Notas

- Funciona mesmo que o PR tenha título genérico (`chore(tasks): f2-s01 review`).
- Funciona mesmo se a branch local foi deletada — usa o estado remoto.
- Requer `gh` CLI autenticado para Layer 0.
