# ADR 006 — Upload de documentos via UI (síncrono, sem fila)

- **Status:** Aceito
- **Data:** 2026-06-01
- **Decisor(es):** time de engenharia da entrega

## Contexto

O PRD exige que documentos possam ser adicionados ao acervo de cada tenant.
O slot F1-S03 expôs `POST /api/documents` e `GET /api/documents`. Este ADR
registra as decisões de UX e de arquitetura do pipeline de ingestão via
browser, complementando o fluxo CLI (`npm run ingest`).

As restrições do ambiente local são determinantes:

- O demo roda em `localhost`. Não há infraestrutura de filas ou workers
  externos.
- O acervo inicial é pequeno (< 12 arquivos por tenant, < 10 MB cada).
- A latência de embedding em batch via OpenAI é tipicamente 2–6 s para
  documentos de tamanho médio — dentro do limiar de espera aceitável numa
  ferramenta interna.

## Decisão

### Upload síncrono — sem fila, sem outbox

O `POST /api/documents` executa o pipeline inteiro na mesma request HTTP:
parse → chunking → embedding (batch) → gravação no Postgres.

A alternativa de fila assíncrona (outbox + worker) foi considerada e
descartada para v1:

- Exigiria Redis/BullMQ ou Postgres-backed job table, aumentando a
  complexidade de setup.
- Tornaria o demo não-reproduzível com um único `npm run dev`.
- O feedback imediato ao usuário (status "ready" + contagem de chunks) é
  valioso em uma ferramenta de demo; a fila tornaria esse feedback opaco.

O trade-off explícito: requests longas (> 30 s) bloqueiam a connection e
podem causar timeout no browser. Aceitável para documentos ≤ 10 MB em rede
local. Mitigação futura: outbox + worker (ver Consequências).

### O arquivo bruto não é persistido em disco

O buffer do `multipart/form-data` é descartado após a extração do texto.
Os chunks são a única fonte de verdade — re-ingestão recalcula tudo a
partir do `content_hash`, garantindo idempotência. Armazenar o binário
original traria custo de storage sem benefício para o agente de RAG.

### `MAX_UPLOAD_SIZE_MB=10` como default

O limite de 10 MB foi escolhido porque:

- A maioria dos documentos internos de RH (políticas, contratos, manuais)
  cabe confortavelmente nesse limite.
- Em 10 MB de texto denso (~5 M caracteres), o batch de embeddings via
  `text-embedding-3-small` cabe em uma única chamada à API.
- Acima disso, a latência da request HTTP cresce além do aceitável para
  upload síncrono.

O valor é configurável via `.env` para ambientes que precisem de limites
diferentes.

## Alternativas consideradas

| Opção | Descartada por |
|---|---|
| Fila assíncrona (BullMQ + Redis) | Complexidade de setup; quebra reprodutibilidade local com `npm run dev`. |
| Server-Sent Events para progresso | Overhead de protocolo; ganho marginal dado que a maioria dos uploads termina em < 10 s. |
| Armazenar binário em `public/` | Storage sem valor para RAG; risco de vazar dados sensíveis via URL pública. |
| Limite de 50 MB | Uma única chamada de embedding pode exceder 8192 tokens (limite da API); requer chunking de embedding, aumentando complexidade. |

## Consequências aceitas

- Requests lentas podem esgotar o timeout do browser (30 s padrão do
  Next.js). Para documentos muito grandes, o usuário verá erro de rede.
  Documentado na UI com mensagem de fallback.
- Sem retry automático em falha de embedding — o usuário precisa fazer
  novo upload. Aceitável para v1.
- Migração futura para fila assíncrona requer: (1) tabela de jobs no
  Postgres ou Redis, (2) worker separado, (3) endpoint de polling de
  status. A UI já suporta status `queued`/`processing`/`ready`/`failed`
  no `DocumentStatusBadge`, facilitando essa evolução.
