import "../helpers/test-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { DOCUMENT_STATUSES, type DocumentStatus, documents } from "@/server/db/schema";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../src/server/db/migrations/0001_documents_upload.sql",
);
const JOURNAL_PATH = resolve(
  __dirname,
  "../../src/server/db/migrations/meta/_journal.json",
);

describe("documents upload schema", () => {
  it("exposes the four canonical statuses in lifecycle order", () => {
    expect(DOCUMENT_STATUSES).toEqual(["pending", "processing", "ready", "failed"]);
  });

  it("derives DocumentStatus as the exact literal union", () => {
    expectTypeOf<DocumentStatus>().toEqualTypeOf<
      "pending" | "processing" | "ready" | "failed"
    >();
  });

  it("declares nullable error and processedAt on the documents table", () => {
    expect(documents.error.notNull).toBe(false);
    expect(documents.processedAt.notNull).toBe(false);
    expect(documents.status.notNull).toBe(true);
    expect(documents.status.default).toBe("ready");
  });

  it("ships migration 0001 with the new columns and composite index", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/ADD COLUMN "error" text/);
    expect(sql).toMatch(/ADD COLUMN "processed_at" timestamp with time zone/);
    expect(sql).toMatch(
      /CREATE INDEX "documents_tenant_status_idx" ON "documents".*"tenant_id".*"status"/s,
    );
  });

  it("registers migration 0001 in the journal", () => {
    const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const entry = journal.entries.find((e) => e.idx === 1);
    expect(entry?.tag).toBe("0001_documents_upload");
  });
});
