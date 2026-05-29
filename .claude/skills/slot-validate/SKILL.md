---
name: slot-validate
description: Roda automaticamente os comandos do bloco "## Validação" do slot. Substitui rodar lint/typecheck/test manualmente um a um.
---

# /slot-validate <SLOT-ID>

```powershell
python scripts/slot.py validate <SLOT-ID>
```

Parseia o bloco `## Validação` do markdown do slot e executa cada comando em code fence. Retorna pass/fail por comando + exit code agregado.

## Quando usar

- Antes de `finish` — confirma que tudo verde.
- Durante o desenvolvimento, sempre que quiser revalidar.

## Comportamento auto

- Se `slot.config.json` tem `migrations.enabled: true` e o slot toca o diretório de migrations, invoca `check-migrations` automaticamente.
- Em worktree, linka `node_modules/` do main para evitar reinstalar deps (se `validation.auto_link_node_modules: true` no config).

## Saída

JSON-friendly por padrão. Verde = exit 0; vermelho = exit 1 + lista dos comandos que falharam.
