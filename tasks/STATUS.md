# STATUS — Board de slots

> Atualize via `python scripts/slot.py sync` (NAO edite a mao — slot frontmatters sao a fonte da verdade).

Legenda: `available` 🟢 · `blocked` ⏸️ · `claimed` 🟡 · `in-progress` 🔵 · `review` 🟣 · `done` ✅ · `cancelled` ⚫

## Resumo

| Fase | Total | 🟢  | ⏸️  | 🟡  | 🔵  | 🟣  | ✅  |
| ---- | ----- | --- | --- | --- | --- | --- | --- |
| F1   | 5     | 0   | 2   | 0   | 1   | 0   | 2   |

## Fase 1 — Proximas features

| ID     | Titulo                                                             | Status        | Prioridade | Depende de |
| ------ | ------------------------------------------------------------------ | ------------- | ---------- | ---------- |
| F1-S01 | Schema documents para upload async (status + error + processed_at) | ✅ done        | high       | —          |
| F1-S02 | Expor ingestBuffer e reaproveitar pipeline na CLI                  | ✅ done        | high       | —          |
| F1-S03 | API /api/documents (POST upload + GET listagem por tenant)         | 🔵 in-progress | high       | —          |
| F1-S04 | Componentes React de upload e listagem de documentos               | ⏸️ blocked    | medium     | —          |
| F1-S05 | Integrar upload na page principal + ADR + README                   | ⏸️ blocked    | medium     | —          |
