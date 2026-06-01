"use client";

import type { DocumentStatus } from "./document-status";

const STATUS_CONFIG: Record<DocumentStatus, { label: string; className: string }> = {
  pending: {
    label: "Pendente",
    className: "bg-muted/20 text-muted border border-muted/30",
  },
  processing: {
    label: "Processando",
    className: "bg-accent/15 text-accent border border-accent/30",
  },
  ready: {
    label: "Pronto",
    className: "bg-success/15 text-success border border-success/30",
  },
  failed: {
    label: "Falhou",
    className: "bg-danger/15 text-danger border border-danger/30",
  },
};

export default function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${config.className}`}
    >
      {config.label}
    </span>
  );
}
