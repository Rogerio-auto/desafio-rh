---
name: auto-review
description: Pré-relatório de segurança determinístico (greps contra o diff). Use ANTES de invocar security-reviewer humano/agente — economiza ~25k tokens por slot.
---

# /auto-review <SLOT-ID>

```powershell
python scripts/slot.py auto-review <SLOT-ID> --json
```

## Checks (categorizados por severidade)

**High:**
- `as any` / `: any` / `@ts-ignore`
- Compare não-timing-safe em código de auth (`== token`)
- `--no-verify` em scripts
- Colisão de número de migration (se migrations habilitado)

**Medium:**
- `console.log` / `print` em código não-teste
- Hex hardcoded em arquivos de UI (`.tsx`, `.css`)

**Low:**
- Imports não usados, comentários TODO em código novo

## Saída

```json
{
  "slot_id": "F1-S03",
  "findings": {
    "high": [{ "label": "ts:any-cast", "file": "...", "line": 42, "snippet": "..." }],
    "medium": [...],
    "low": [...]
  },
  "exit_code": 2
}
```

Exit code 2 = há findings high (bloqueia merge).

## Customização

`slot.config.json` → `review_checks.disabled` aceita lista de labels para desativar (ex: `["ui:hex-hardcoded"]` se o projeto não usa Design System estrito).

## Quando usar

- Antes de chamar `security-reviewer` (humano ou agente).
- Antes de marcar slot como `done`.
- Em CI como gate automático.

## Limitações

É **grep determinístico** — não captura race conditions, oracle de existência, prompt injection contextual, etc. Use como ponto de partida; o reviewer humano/agente expande.
