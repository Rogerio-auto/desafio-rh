import postgres from "postgres";
import { getEnv } from "@/lib/env";
import { logger } from "@/server/logging/logger";

async function main() {
  const env = getEnv();
  const client = postgres(env.DATABASE_URL, { max: 1, prepare: false });
  try {
    const available = await client<{ name: string; default_version: string }[]>`
      SELECT name, default_version
      FROM pg_available_extensions
      WHERE name = 'vector'
    `;
    if (available.length === 0) {
      logger.error(
        {},
        "pgvector_not_available_on_server: install pgvector binaries for this PostgreSQL major version (see README › pgvector setup)",
      );
      process.exitCode = 2;
      return;
    }
    await client`CREATE EXTENSION IF NOT EXISTS vector`;
    const installed = await client<{ extname: string; extversion: string }[]>`
      SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'
    `;
    if (installed.length === 0) {
      logger.error({}, "pgvector_install_failed_silently");
      process.exitCode = 2;
      return;
    }
    const ext = installed[0];
    if (!ext) {
      logger.error({}, "pgvector_install_failed_silently");
      process.exitCode = 2;
      return;
    }
    logger.info({ version: ext.extversion }, "pgvector_enabled");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    "enable_pgvector_fatal",
  );
  process.exitCode = 1;
});
