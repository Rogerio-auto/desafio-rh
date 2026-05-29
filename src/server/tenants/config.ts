/**
 * Single source of truth for the supported tenants. The slug is the value used
 * across the API, the database, the UI selector and the chat URL. The folder
 * name(s) below are the directories that hold each tenant's documents inside
 * the local `./documentos` tree.
 *
 * Slugs and names match the PRD. Folder names match what is actually shipped
 * on disk inside this repo's sibling `documentos/` directory. If the source
 * documents are reorganised, update `documentFolders` — not the slugs.
 */
export interface TenantConfig {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly documentFolders: readonly string[];
}

export const TENANT_CONFIGS: readonly TenantConfig[] = [
  {
    slug: "norteverde",
    name: "NorteVerde Logística S.A.",
    description: "Transporte rodoviário de cargas. Sede em Cascavel (PR).",
    documentFolders: ["norteverde", "nortverde-logistica", "norteverde-logistica"],
  },
  {
    slug: "aurora",
    name: "Construtora Aurora Engenharia Ltda.",
    description: "Construção civil pesada e edificações comerciais.",
    documentFolders: ["aurora", "construtora-aurora"],
  },
  {
    slug: "vitalys",
    name: "Vitalys Saúde S.A.",
    description: "Operadora de saúde suplementar com clínicas próprias.",
    documentFolders: ["vitalys", "vitalys-saude"],
  },
];

export const TENANT_SLUGS = TENANT_CONFIGS.map((t) => t.slug);
export type TenantSlug = (typeof TENANT_SLUGS)[number];

export function getTenantConfigBySlug(slug: string): TenantConfig | undefined {
  return TENANT_CONFIGS.find((t) => t.slug === slug);
}

export function getTenantConfigByFolder(
  folderName: string,
): TenantConfig | undefined {
  const normalized = folderName.trim().toLowerCase();
  return TENANT_CONFIGS.find((t) =>
    t.documentFolders.some((f) => f.toLowerCase() === normalized),
  );
}

export function isValidTenantSlug(slug: unknown): slug is TenantSlug {
  return typeof slug === "string" && TENANT_SLUGS.includes(slug);
}
