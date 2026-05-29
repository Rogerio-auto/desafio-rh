import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import { logger } from "@/server/logging/logger";

async function main() {
  const env = getEnv();
  const client = postgres(env.DATABASE_URL, { max: 1, prepare: false });
  const db = drizzle(client);
  const migrationsFolder = resolve(process.cwd(), "src/server/db/migrations");
  logger.info({ migrationsFolder }, "migrate_start");
  await migrate(db, { migrationsFolder });
  await client.end({ timeout: 5 });
  logger.info({}, "migrate_done");
}

main().catch((err) => {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    "migrate_fatal",
  );
  process.exitCode = 1;
});
