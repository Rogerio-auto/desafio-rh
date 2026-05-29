---
name: slot-finish
description: Marca slot como review, atualiza STATUS.md, commita chore. NÃO commita seu código — rode `git add && git commit` ANTES.
---

# /slot-finish <SLOT-ID>

```powershell
python scripts/slot.py finish <SLOT-ID>
```

## O que ele faz

1. Atualiza frontmatter: `status: review`, `completed_at`
2. Re-renderiza `tasks/STATUS.md`
3. Commit `chore(tasks): <slot-id> review`

## ⚠️ NÃO commita seu código

`slot.py finish` só commita STATUS.md + frontmatter do slot. O código de implementação é **seu** trabalho commitar.

**Sequência correta:**

```powershell
git add <arquivos do slot>
git commit -m "feat(<modulo>): <descrição> (<SLOT-ID>)"
python scripts/slot.py finish <SLOT-ID>
git push origin feat/<slot-id>
git log --stat origin/feat/<slot-id>     # ← verificação obrigatória
```

Se você pular o `git add && git commit` antes do `finish`, seu código fica não-commitado e será perdido na próxima limpeza de worktree.

## Aborta se

- Slot não está em `in-progress`
- Working tree sujo (você esqueceu de commitar) — a menos que `--force`
