---
name: brief
description: Briefing self-contained de um slot em 1 call — frontmatter, deps, files_allowed, specialist, próxima migration, seções relevantes. Substitui 6-10 reads exploratórios.
---

# /brief

```powershell
python scripts/slot.py brief <SLOT-ID> --json
```

## Quando usar

- Agente especialista começando trabalho em um slot.
- Antes de `claim`, para verificar deps e specialist.
- Para conferir `next_migration_number` antes de criar migration (se migrations habilitado).

## Saída

Em 1 call:

- `slot` — frontmatter parseado
- `specialist` — inferido pelos patterns do config
- `files_allowed` — parseado do corpo do slot
- `existing_files` — até 40 arquivos existentes nas pastas alvo
- `source_docs` — paths apenas
- `depends_on` + status de cada
- `deps_satisfied` — true/false
- `preflight` — branch + dirty
- `next_migration_number` — próximo número livre (se migrations habilitado)
- `sections` — Objetivo, Escopo, DoD, Validação extraídos

## Economia

Antes: 6-10 calls (Read slot + Grep docs + Glob arquivos + ler migrations + check deps)
Depois: 1 call

## Notas

- Não invoque `Read` no slot manualmente depois de `brief`.
- Para `docs/*` grandes, use `Grep -A` na seção apontada pelo briefing.
