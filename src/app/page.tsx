import { TENANT_CONFIGS } from "@/server/tenants/config";
import { PageShell } from "./page-shell";

export default function HomePage() {
  const tenants = TENANT_CONFIGS.map((t) => ({
    slug: t.slug,
    name: t.name,
    description: t.description,
  }));

  return <PageShell tenants={tenants} />;
}
