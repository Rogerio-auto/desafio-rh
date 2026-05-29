import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { ingestDirectory } from "@/server/ingest/ingestor";
import { logger } from "@/server/logging/logger";
import { sql as pg } from "@/server/db/client";

async function main() {
  const { values } = parseArgs({
    options: {
      "docs-dir": {
        type: "string",
        default: "./documentos",
      },
    },
    allowPositionals: true,
  });

  const docsDir = resolve(process.cwd(), values["docs-dir"] ?? "./documentos");
  logger.info({ docsDir }, "ingest_start");

  const report = await ingestDirectory(docsDir);

  for (const t of report.tenants) {
    const ingested = t.files.filter((f) => f.status === "ingested").length;
    const skipped = t.files.filter((f) => f.status === "skipped_duplicate").length;
    const failed = t.files.filter((f) => f.status === "failed");
    logger.info(
      {
        tenant: t.tenantSlug,
        ingested,
        skipped,
        failed: failed.length,
      },
      "ingest_tenant_done",
    );
    if (failed.length > 0) {
      for (const f of failed) {
        logger.warn(
          { tenant: t.tenantSlug, fileName: f.fileName, reason: f.reason },
          "ingest_file_failed",
        );
      }
    }
  }
}

main()
  .catch((err) => {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "ingest_fatal");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.end({ timeout: 5 });
  });
