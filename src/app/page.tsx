import { ChatPanel } from "@/components/chat-panel";
import { TENANT_CONFIGS } from "@/server/tenants/config";

export default function HomePage() {
  const tenants = TENANT_CONFIGS.map((t) => ({
    slug: t.slug,
    name: t.name,
    description: t.description,
  }));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-[0.18em] text-muted">
          Elemento · Agente de RH
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          Atendimento interno de Recursos Humanos
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Selecione a empresa, pergunte em português e receba a resposta com base
          apenas nos documentos do seu próprio acervo. Cada empresa enxerga
          exclusivamente os próprios arquivos.
        </p>
      </header>

      <ChatPanel tenants={tenants} />

      <footer className="border-t border-border pt-4 text-xs text-muted">
        Versão local · Postgres + pgvector · OpenAI-compatible
      </footer>
    </main>
  );
}
