"use client";

import { useMemo, useState } from "react";

interface TenantOption {
  slug: string;
  name: string;
  description: string;
}

interface ChatPanelProps {
  tenants: TenantOption[];
}

interface ChatSource {
  fileName: string;
  chunkId: string;
  similarity: number;
}

interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  latencyMs: number;
  estimatedCostUsd: number;
  retrievedCount: number;
}

export function ChatPanel({ tenants }: ChatPanelProps) {
  const firstSlug = tenants[0]?.slug ?? "";
  const [tenantSlug, setTenantSlug] = useState(firstSlug);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ChatResponse | null>(null);

  const currentTenant = useMemo(
    () => tenants.find((t) => t.slug === tenantSlug),
    [tenants, tenantSlug],
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tenantSlug || question.trim().length < 3 || loading) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: tenantSlug, question: question.trim() }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const errMessage =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : `Erro ${res.status}`;
        throw new Error(errMessage);
      }
      setResponse(data as ChatResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const uniqueSources = useMemo(() => {
    if (!response) return [];
    const seen = new Set<string>();
    const out: ChatSource[] = [];
    for (const s of response.sources) {
      if (seen.has(s.fileName)) continue;
      seen.add(s.fileName);
      out.push(s);
    }
    return out;
  }, [response]);

  return (
    <section className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-2xl border border-border bg-surface/80 p-6 shadow-soft backdrop-blur"
      >
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-muted">Empresa</span>
          <select
            className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            disabled={loading}
          >
            {tenants.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
          {currentTenant ? (
            <span className="text-xs text-muted">{currentTenant.description}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-muted">Pergunta</span>
          <textarea
            className="min-h-[120px] resize-y rounded-lg border border-border bg-elevated px-3 py-2 text-sm leading-6 text-foreground outline-none transition focus:border-accent"
            placeholder="Ex.: Como funciona a política de férias?"
            value={question}
            maxLength={2000}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
          />
          <span className="text-right text-[10px] uppercase tracking-wide text-muted">
            {question.length}/2000
          </span>
        </label>

        <button
          type="submit"
          className="self-start rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-soft transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-elevated disabled:text-muted"
          disabled={loading || question.trim().length < 3}
        >
          {loading ? "Consultando documentos..." : "Perguntar"}
        </button>
      </form>

      {error ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {response ? (
        <article className="flex flex-col gap-5 rounded-2xl border border-border bg-surface/80 p-6 shadow-soft">
          <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-wider text-muted">
            <span>Latência: {response.latencyMs} ms</span>
            <span>·</span>
            <span>Custo estimado: US$ {response.estimatedCostUsd.toFixed(6)}</span>
            <span>·</span>
            <span>{response.retrievedCount} trecho(s)</span>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-7 text-foreground">
            {response.answer}
          </div>
          {uniqueSources.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <span className="text-xs uppercase tracking-wide text-muted">
                Fontes
              </span>
              <ul className="flex flex-col gap-1">
                {uniqueSources.map((s) => (
                  <li
                    key={s.chunkId}
                    className="flex items-center justify-between rounded-md bg-elevated/70 px-3 py-2 text-xs text-foreground"
                  >
                    <span className="font-mono">{s.fileName}</span>
                    <span className="text-muted">
                      similaridade {s.similarity.toFixed(3)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-xs italic text-muted">
              Nenhum documento relevante consultado.
            </div>
          )}
        </article>
      ) : null}
    </section>
  );
}
