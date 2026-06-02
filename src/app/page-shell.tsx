"use client";

import { useMemo, useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import DocumentList from "@/components/document-list";
import DocumentUpload from "@/components/document-upload";

interface TenantOption {
  slug: string;
  name: string;
  description: string;
}

interface PageShellProps {
  tenants: TenantOption[];
}

export function PageShell({ tenants }: PageShellProps) {
  const firstSlug = tenants[0]?.slug ?? "";
  const [tenantSlug, setTenantSlug] = useState(firstSlug);
  // Incrementing this number triggers DocumentList to refetch after a successful upload.
  const [refreshSignal, setRefreshSignal] = useState(0);

  const currentTenant = useMemo(
    () => tenants.find((t) => t.slug === tenantSlug),
    [tenants, tenantSlug],
  );

  function handleUploaded() {
    setRefreshSignal((n) => n + 1);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-[0.18em] text-muted">
          Elemento · Agente de RH
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          Atendimento interno de Recursos Humanos
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Selecione a empresa, pergunte em português e receba a resposta com base apenas
          nos documentos do seu próprio acervo. Cada empresa enxerga exclusivamente os
          próprios arquivos.
        </p>
      </header>

      {/* Shared tenant selector */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="global-tenant-select"
          className="text-xs uppercase tracking-wide text-muted"
        >
          Empresa
        </label>
        <select
          id="global-tenant-select"
          className="w-full max-w-xs rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"
          value={tenantSlug}
          onChange={(e) => setTenantSlug(e.target.value)}
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
      </div>

      {/* Two-column layout: chat on the left, upload + list on the right */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Chat column */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Consultar documentos
          </h2>
          {/* ChatPanel manages its own internal tenant selector as well;
              we pass tenants so it renders the same options. */}
          <ChatPanel tenants={tenants} />
        </section>

        {/* Upload + list column */}
        <section className="flex flex-col gap-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Gerenciar documentos
          </h2>

          <DocumentUpload tenantSlug={tenantSlug} onUploaded={handleUploaded} />

          <DocumentList tenantSlug={tenantSlug} refreshSignal={refreshSignal} />
        </section>
      </div>

      <footer className="border-t border-border pt-4 text-xs text-muted">
        Versão local · Postgres + pgvector · OpenAI-compatible
      </footer>
    </main>
  );
}
