---
name: preflight
description: Verifica working tree limpo + branch correta + main em sync com origin. Aborta com exit 1 se algo errado. Use no início de QUALQUER agente.
---

# /preflight

```powershell
python scripts/slot.py preflight
```

## O que checa

1. **Working tree limpo:** ignora untracked + `.claude/settings.local.json`.
2. **Branch sensata:** se rodando no working tree principal, deve estar em `main` ou em uma branch `feat/*`.
3. **Main em sync com origin:** se está em `main`, confere que `git pull --ff-only` funcionaria.

## Saída

```
preflight: OK
  branch: main
  worktree: clean
  main: in-sync with origin
```

Exit 0 = pode prosseguir. Exit 1 = aborte e reporte.

## Quando usar

- **Sempre** no início de um agente especialista, antes do `claim`.
- Antes de despachar agentes paralelos.
- Quando algo parece errado e você quer um diagnóstico rápido.

## Por que importa

Working tree sujo + agentes paralelos = swap de branch entre agentes → commits em branch errada → arquivos órfãos. Sempre faça preflight.
