# STATUS — Board de slots

> Atualize via `python scripts/slot.py sync` (NAO edite a mao — slot frontmatters sao a fonte da verdade).

Legenda: `available` 🟢 · `blocked` ⏸️ · `claimed` 🟡 · `in-progress` 🔵 · `review` 🟣 · `done` ✅ · `cancelled` ⚫

## Resumo

| Fase | Total | 🟢  | ⏸️  | 🟡  | 🔵  | 🟣  | ✅  |
| ---- | ----- | --- | --- | --- | --- | --- | --- |
| F1   | 5     | 1   | 4   | 0   | 0   | 0   | 0   |

## Fase 1 — Proximas features

| ID                             | Titulo                                                             | Status      | Prioridade | Depende de |
| ------------------------------ | ------------------------------------------------------------------ | ----------- | ---------- | ---------- |
| F1-S01-documents-upload-schema | Schema documents para upload async (status + error + processed_at) | 🟢 available | high       | —          |
| F1-S02-ingest-buffer           | Expor ingestBuffer e reaproveitar pipeline na CLI                  | ⏸️ blocked  | high       | —          |
| F1-S03-documents-api           | API /api/documents (POST upload + GET listagem por tenant)         | ⏸️ blocked  | high       | —          |
| F1-S04-upload-ui               | Componentes React de upload e listagem de documentos               | ⏸️ blocked  | medium     | —          |
| F1-S05-page-integration        | Integrar upload na page principal + ADR + README                   | ⏸️ blocked  | medium     | —          |
