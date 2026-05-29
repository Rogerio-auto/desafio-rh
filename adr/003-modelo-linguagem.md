# ADR 003 — Modelo de linguagem e cliente

- **Status:** Aceito
- **Data:** 2026-05-28

## Problema

Escolher o(s) modelo(s) de linguagem para geração e embeddings, e como
acoplá-los à aplicação, mantendo custo baixo, latência P95 < 8 s, e
portabilidade entre provedores.

## Contexto e restrições

- Aplicação local, sem autenticação corporativa.
- Volume alvo: 15 000 perguntas/mês.
- PT-BR como idioma único de resposta.
- O acervo é pequeno e o RAG entrega o contexto — modelos médios bastam.
- O fundador prefere não amarrar a um provedor único.

## Opções consideradas

| Combinação | Custo (input/output, 1M tok) | PT-BR | Latência típica |
|---|---|---|---|
| OpenAI `gpt-4o-mini` + `text-embedding-3-small` | 0,15 / 0,60 + 0,02 | Excelente | 1–3 s |
| OpenAI `gpt-4o` + `text-embedding-3-large` | 2,50 / 10,00 + 0,13 | Excelente | 1–3 s |
| Anthropic `claude-haiku-4-5` via SDK próprio | 0,80 / 4,00 | Excelente | 1–2 s |
| Llama 3.1 8B local (Ollama) | 0 | Médio | 5–10 s, depende de hardware |

## Decisão

- **Geração:** `gpt-4o-mini` (default em `.env.example`), trocável via
  `LLM_MODEL`.
- **Embedding:** `text-embedding-3-small` (1536 dim), trocável via
  `EMBEDDING_MODEL` + `EMBEDDING_DIMENSIONS`.
- **Cliente:** SDK oficial `openai` com `baseURL` configurável. Isso
  cobre OpenAI, OpenRouter, Groq, Together, Azure OpenAI, e qualquer
  outro provedor que exponha a API compatível.

A combinação default custa **~US$ 5/mês** para o volume alvo (ver
ARCHITECTURE › Custos).

## Consequências aceitas

- A camada de IA fica acoplada à *forma* da API OpenAI. Para usar a API
  nativa da Anthropic ou Gemini, é preciso adicionar um adapter; fora
  de escopo da v1.
- Embeddings dependem de uma chave externa. Para deploy 100% offline,
  trocar `EMBEDDING_MODEL` por um modelo local (ex.: bge-m3 via Ollama)
  e manter a mesma interface — exige só atualizar `.env`.
- Mudar o modelo de embedding muda a dimensão e exige reingestão; está
  documentado em README e ADR 001.
