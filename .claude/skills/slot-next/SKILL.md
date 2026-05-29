---
name: slot-next
description: Lista slots com status=available cujas dependências estão done. Use quando quiser saber o que pegar agora.
---

# /slot-next

```powershell
python scripts/slot.py list-available
```

Lista slot IDs prontos pra ser claimed.

## Quando usar

- Decidir o próximo slot quando o orquestrador não está envolvido.
- Verificar se uma dependência liberou novos slots após merge.

## Alternativas

- `python scripts/slot.py list-available --json` — saída estruturada.
- `python scripts/slot.py plan-batch --max 3 --json` — recomenda batch com colisão de files_allowed resolvida.
