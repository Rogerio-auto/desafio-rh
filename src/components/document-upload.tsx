"use client";

import { useCallback, useRef, useState } from "react";

type UploadResult = {
  id: string | null;
  status: string;
  chunks?: number;
};

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "success"; fileName: string; result: UploadResult }
  | { phase: "duplicate"; fileName: string }
  | { phase: "error"; message: string };

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.xlsx,.md,.txt";

function FilePlusIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export default function DocumentUpload({
  tenantSlug,
  onUploaded,
}: {
  tenantSlug: string;
  onUploaded?: (doc: UploadResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [isDragging, setIsDragging] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      setState({ phase: "uploading" });

      const form = new FormData();
      form.append("tenant", tenantSlug);
      form.append("file", file);

      let res: Response;
      try {
        res = await fetch("/api/documents", { method: "POST", body: form });
      } catch {
        setState({ phase: "error", message: "Falha de rede. Verifique sua conexão." });
        return;
      }

      const data: unknown = await res.json().catch(() => ({}));
      const body =
        typeof data === "object" && data !== null
          ? (data as Record<string, unknown>)
          : {};

      if (res.status === 413) {
        setState({
          phase: "error",
          message: "Arquivo excede o limite de tamanho permitido.",
        });
        return;
      }

      if (res.status === 415) {
        setState({
          phase: "error",
          message: "Formato não suportado. Use PDF, DOCX, XLSX, MD ou TXT.",
        });
        return;
      }

      if (!res.ok) {
        const serverMsg = typeof body["error"] === "string" ? body["error"] : null;
        setState({
          phase: "error",
          message: serverMsg ?? `Erro ${res.status} ao processar o arquivo.`,
        });
        return;
      }

      const status = typeof body["status"] === "string" ? body["status"] : "unknown";
      const docId = typeof body["documentId"] === "string" ? body["documentId"] : null;
      const chunks = typeof body["chunks"] === "number" ? body["chunks"] : undefined;

      if (status === "duplicate") {
        setState({ phase: "duplicate", fileName: file.name });
        return;
      }

      const result: UploadResult = { id: docId, status, chunks };
      setState({ phase: "success", fileName: file.name, result });
      onUploaded?.(result);
    },
    [tenantSlug, onUploaded],
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input value so re-uploading the same file triggers the event
    e.target.value = "";
    void uploadFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    void uploadFile(file);
  }

  function handleReset() {
    setState({ phase: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  const isUploading = state.phase === "uploading";

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Área de upload de arquivo — clique ou solte um arquivo aqui"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isUploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={[
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          isUploading
            ? "cursor-not-allowed border-border bg-elevated/50"
            : isDragging
              ? "border-accent bg-accent/10"
              : "border-border bg-surface/80 hover:border-accent/60 hover:bg-elevated/60",
        ].join(" ")}
      >
        <div
          className={[
            "transition-colors duration-150",
            isDragging ? "text-accent" : "text-muted",
          ].join(" ")}
        >
          {isUploading ? <Spinner /> : <FilePlusIcon />}
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-sm font-medium text-foreground">
            {isUploading ? "Enviando…" : "Solte aqui ou clique para selecionar"}
          </span>
          <span className="text-xs text-muted">PDF, DOCX, XLSX, MD, TXT</span>
        </div>
      </div>

      <input
        ref={inputRef}
        id="document-upload-input"
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="sr-only"
        aria-label="Selecionar arquivo para upload"
        disabled={isUploading}
        onChange={handleFileChange}
      />

      {/* Status region — aria-live so screen readers announce changes */}
      <div aria-live="polite" aria-atomic="true">
        {state.phase === "success" && (
          <div className="flex items-start justify-between gap-4 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-success">Upload concluído</span>
              <span className="text-xs text-muted">
                {state.fileName}
                {state.result.chunks !== undefined && (
                  <>
                    {" "}
                    &mdash; {state.result.chunks} trecho
                    {state.result.chunks !== 1 ? "s" : ""} indexado
                    {state.result.chunks !== 1 ? "s" : ""}
                  </>
                )}
              </span>
            </div>
            <button
              onClick={handleReset}
              className="mt-0.5 flex-shrink-0 rounded-md px-2 py-1 text-xs text-success/70 transition hover:bg-success/20 hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success"
            >
              Novo
            </button>
          </div>
        )}

        {state.phase === "duplicate" && (
          <div className="flex items-start justify-between gap-4 rounded-xl border border-muted/30 bg-elevated px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                Arquivo já existe
              </span>
              <span className="text-xs text-muted">
                {state.fileName} já foi enviado anteriormente e está na base.
              </span>
            </div>
            <button
              onClick={handleReset}
              className="mt-0.5 flex-shrink-0 rounded-md px-2 py-1 text-xs text-muted transition hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
            >
              Ok
            </button>
          </div>
        )}

        {state.phase === "error" && (
          <div className="flex items-start justify-between gap-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-danger">Erro no upload</span>
              <span className="text-xs text-muted">{state.message}</span>
            </div>
            <button
              onClick={handleReset}
              className="mt-0.5 flex-shrink-0 rounded-md px-2 py-1 text-xs text-danger/70 transition hover:bg-danger/20 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
