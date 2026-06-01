"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentStatus } from "./document-status";
import DocumentStatusBadge from "./document-status-badge";

// ---------------------------------------------------------------------------
// API response shape (derived from GET /api/documents, no server imports)
// ---------------------------------------------------------------------------

interface DocumentItem {
  id: string;
  fileName: string;
  mimeType: string;
  status: DocumentStatus;
  error: string | null;
  processedAt: string | null;
  createdAt: string;
}

interface DocumentsResponse {
  items: DocumentItem[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Fetch logic
// ---------------------------------------------------------------------------

async function fetchDocuments(
  tenantSlug: string,
  cursor?: string,
): Promise<DocumentsResponse> {
  const url = new URL("/api/documents", window.location.origin);
  url.searchParams.set("tenant", tenantSlug);
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const msg =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as Record<string, unknown>)["error"] === "string"
        ? (body as Record<string, unknown>)["error"]
        : `Erro ${res.status}`;
    throw new Error(String(msg));
  }
  return res.json() as Promise<DocumentsResponse>;
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <tr className="animate-pulse border-t border-border">
      <td className="py-3 pl-4 pr-3">
        <div className="h-3.5 w-44 rounded bg-elevated" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3.5 w-24 rounded bg-elevated" />
      </td>
      <td className="px-3 py-3">
        <div className="h-5 w-20 rounded-full bg-elevated" />
      </td>
      <td className="py-3 pl-3 pr-4">
        <div className="h-3.5 w-28 rounded bg-elevated" />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Date formatter — avoids SSR mismatch by always using a stable locale
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ListState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      items: DocumentItem[];
      nextCursor: string | null;
      loadingMore: boolean;
    };

export default function DocumentList({
  tenantSlug,
  refreshSignal = 0,
}: {
  tenantSlug: string;
  refreshSignal?: number;
}) {
  const [listState, setListState] = useState<ListState>({ phase: "loading" });
  // Track in-flight fetch to prevent stale updates after unmount / signal change
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setListState({ phase: "loading" });
      try {
        const data = await fetchDocuments(tenantSlug);
        if (signal.aborted) return;
        setListState({
          phase: "ready",
          items: data.items,
          nextCursor: data.nextCursor,
          loadingMore: false,
        });
      } catch (err) {
        if (signal.aborted) return;
        setListState({
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [tenantSlug],
  );

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshSignal]);

  async function handleLoadMore() {
    if (listState.phase !== "ready" || !listState.nextCursor || listState.loadingMore)
      return;
    const cursor = listState.nextCursor;
    setListState((prev) => {
      if (prev.phase !== "ready") return prev;
      return { ...prev, loadingMore: true };
    });
    try {
      const data = await fetchDocuments(tenantSlug, cursor);
      setListState((prev) => {
        if (prev.phase !== "ready") return prev;
        return {
          phase: "ready",
          items: [...prev.items, ...data.items],
          nextCursor: data.nextCursor,
          loadingMore: false,
        };
      });
    } catch (err) {
      setListState((prev) => {
        if (prev.phase !== "ready") return prev;
        return {
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        };
      });
    }
  }

  // ----- Render states -----

  if (listState.phase === "loading") {
    return (
      <div className="rounded-2xl border border-border bg-surface/80 shadow-soft">
        <table className="w-full text-sm">
          <TableHead />
          <tbody>
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonRow key={i} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (listState.phase === "error") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-6 py-10 text-center">
        <span className="text-sm text-danger">{listState.message}</span>
        <button
          onClick={() => {
            const controller = new AbortController();
            void load(controller.signal);
          }}
          className="rounded-lg border border-danger/30 px-4 py-2 text-xs text-danger transition hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const { items, nextCursor, loadingMore } = listState;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface/80 px-6 py-14 text-center shadow-soft">
        <span className="text-sm font-medium text-foreground">
          Nenhum documento ainda
        </span>
        <span className="text-xs text-muted">
          Faça upload de um arquivo para começar a consultar a base.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-surface/80 shadow-soft">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <TableHead />
          <tbody>
            {items.map((doc) => (
              <tr
                key={doc.id}
                className="border-t border-border transition-colors hover:bg-elevated/60"
              >
                <td className="py-3 pl-4 pr-3">
                  <span
                    className="block max-w-[240px] truncate font-mono text-xs text-foreground"
                    title={doc.fileName}
                  >
                    {doc.fileName}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs text-muted">{doc.mimeType}</span>
                </td>
                <td className="px-3 py-3">
                  <DocumentStatusBadge status={doc.status} />
                  {doc.status === "failed" && doc.error ? (
                    <span
                      className="mt-0.5 block text-[11px] text-danger/80"
                      title={doc.error}
                    >
                      {doc.error.length > 48 ? doc.error.slice(0, 48) + "…" : doc.error}
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pl-3 pr-4">
                  <span className="text-xs text-muted">
                    {formatDate(doc.processedAt ?? doc.createdAt)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor ? (
        <div className="flex items-center justify-center border-t border-border px-4 py-3">
          <button
            onClick={() => void handleLoadMore()}
            disabled={loadingMore}
            className="rounded-lg px-5 py-2 text-xs font-medium text-muted transition hover:bg-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {loadingMore ? "Carregando…" : "Carregar mais"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TableHead() {
  return (
    <thead>
      <tr>
        {(["Arquivo", "Tipo", "Status", "Atualizado em"] as const).map((col) => (
          <th
            key={col}
            scope="col"
            className={[
              "py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted",
              col === "Arquivo"
                ? "pl-4 pr-3"
                : col === "Atualizado em"
                  ? "pl-3 pr-4"
                  : "px-3",
            ].join(" ")}
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}
