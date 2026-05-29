# ADR 005 — Logging e observabilidade

- **Status:** Aceito
- **Data:** 2026-05-28

## Problema

Toda interação precisa ser auditável (PRD §4.2, §5). Precisamos de logs
estruturados que sirvam tanto para depuração quanto para análise de
custo, latência e qualidade, sem nunca vazar segredos.

## Contexto e restrições

- Aplicação roda em Node.js (server side do Next.js).
- Custos e tokens precisam ser computáveis para cada interação.
- Conformidade LGPD: dados pessoais que aparecem em perguntas devem ser
  tratados com responsabilidade.
- Local-first: a saída precisa funcionar bem em stdout (dev) e em
  agregadores típicos (Loki, Datadog, CloudWatch) em produção.

## Opções consideradas

1. **`console.log` ad-hoc.** Não estruturado; impossível filtrar; sem
   redação de segredos.
2. **Winston.** Maduro, mas mais lento e com API mais pesada.
3. **Pino.** JSON nativo, ~5× mais rápido que Winston, suporta
   `redact`, `child loggers` e formato compatível com Datadog/Loki.
4. **OpenTelemetry full-stack.** Excelente, mas overkill para v1 local.

## Decisão

Adotar **Pino**:

- Saída JSON via `process.stdout` (uma linha por evento).
- `redact.paths` cobre as chaves sensíveis típicas
  (`OPENAI_COMPATIBLE_API_KEY`, `DATABASE_URL`, `password`, etc.).
- Cada interação de chat emite um evento `chat_interaction` com
  `timestamp`, `tenant`, `question`, `documentsRetrieved`, `latencyMs`,
  `estimatedCostUsd`, `status` e `error?`.
- Toda interação é também persistida em `chat_interactions` no Postgres
  para análise via SQL.
- `logs-exemplo/exemplo-interacao.jsonl` documenta o formato.

A migração para OpenTelemetry fica aberta: Pino tem
[`pino-opentelemetry-transport`](https://github.com/pinojs/pino-opentelemetry-transport)
quando a produção exigir traces distribuídos.

## Consequências aceitas

- Perguntas dos colaboradores ficam em `chat_interactions.question` em
  claro. Em produção, mascarar PII ou aplicar retenção via job
  periódico. Documentado como evolução em ARCHITECTURE.
- Logs não são enviados a um agregador por padrão — produção precisa
  configurar transport. Aceitável para a v1 local.
- O log estruturado pode ser pesado em debug; nível default é `info`.
