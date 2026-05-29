---
name: worktree-clean
description: Remove worktrees stale após merge. Windows-safe (long-path com `\\?\` prefix). Use SOMENTE após confirmar que todo o trabalho dos worktrees foi commitado E pushado.
---

# /worktree-clean

```powershell
python scripts/slot.py worktree-clean
```

## O que faz

1. Lista worktrees adicionais em `.claude/worktrees/agent-*`.
2. Pra cada um:
   - Tenta unlock (`git worktree unlock`).
   - Remove o diretório (com prefixo `\\?\` no Windows para suportar paths longos).
3. `git worktree prune` para limpar referências.

## ⚠️ Pré-requisito crítico

**SOMENTE rodar após confirmar que todo trabalho dos worktreets:**
1. Foi commitado (`git log --stat origin/feat/<slot>` mostra os arquivos).
2. Foi pushado para `origin`.

Se rodar com código não-commitado em algum worktree → código perdido. Incidente já documentado em `PROTOCOL.md` §7.6.

## Quando usar

- Após `reconcile-merged --write` ter marcado slots como `done`.
- Quando `git worktree list` mostra worktrees stale.
- Periodicamente em sessões longas pra liberar disco/memória.

## Quando NÃO usar

- Se algum agente ainda está trabalhando num worktree.
- Se há código uncommitted/unpushed em qualquer worktree.
