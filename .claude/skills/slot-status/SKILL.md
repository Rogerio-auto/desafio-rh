---
name: slot-status
description: Resumo compacto do board de slots (10 linhas). Substitui leitura de STATUS.md inteiro.
---

# /slot-status

```powershell
python scripts/slot.py status
```

Saída de ~10 linhas: contagem por fase + estado, próximos slots disponíveis, slots em progresso.

## Quando usar

- Início de sessão pra ver onde está o trabalho.
- Antes de decidir qual slot pegar.
- Após merge de PR para confirmar reconciliação.

## Alternativas

- `python scripts/slot.py status --json` — saída estruturada.
- `python scripts/slot.py status --phase F1` — só uma fase.
- `python scripts/slot.py list-available` — só os slots prontos.
- `python scripts/slot.py plan-batch --max 3 --json` — recomenda batch paralelo (use no orchestrator).
