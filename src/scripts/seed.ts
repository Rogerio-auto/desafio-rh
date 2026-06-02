import { getOrCreateTenant } from "@/server/tenants/service";
import { TENANT_CONFIGS } from "@/server/tenants/config";
import { logger } from "@/server/logging/logger";
import { sql as pg } from "@/server/db/client";

async function main() {
  for (const config of TENANT_CONFIGS) {
    const tenant = await getOrCreateTenant(config.slug);
    logger.info({ slug: tenant.slug, id: tenant.id, name: tenant.name }, "tenant_seeded");
  }
}

main()
  .catch((err) => {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "seed_fatal");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.end({ timeout: 5 });
  });
