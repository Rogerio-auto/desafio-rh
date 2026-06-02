import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

/**
 * Tiny zero-dependency dotenv loader. Reads `.env` from the current working
 * directory (project root) and sets values into `process.env` without
 * overriding values that are already defined by the OS/shell.
 *
 * Drizzle Kit and Next.js handle env loading on their own; this exists so
 * standalone `tsx` scripts (migrate, seed, ingest, enable-pgvector) work
 * without an extra runtime dependency.
 */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  const candidates = [process.env.DOTENV_PATH, resolve(process.cwd(), ".env")].filter(
    (p): p is string => Boolean(p),
  );

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const raw = readFileSync(filePath, "utf8");
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (!key) continue;
      if (process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
