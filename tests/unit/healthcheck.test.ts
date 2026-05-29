import "../helpers/test-env";
import { describe, expect, it, vi } from "vitest";

/**
 * Asserts that the healthcheck implementation calls Postgres for a real
 * roundtrip (not just returning 200). We mock the postgres client to control
 * whether the DB is "up" or "down".
 */
describe("/api/health route", () => {
  it("reports ok when DB returns 1 and pgvector is installed", async () => {
    vi.resetModules();
    vi.doMock("@/server/db/client", () => {
      const fn = vi.fn(async (strings: TemplateStringsArray | unknown) => {
        const text = Array.isArray(strings) ? (strings as string[]).join("") : "";
        if (text.includes("pg_extension")) return [{ extversion: "0.7.0" }];
        return [{ ok: 1 }];
      });
      return {
        sql: fn,
        db: {},
      };
    });
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
    expect(body.pgvector).toBe("0.7.0");
  });

  it("reports degraded status when DB throws", async () => {
    vi.resetModules();
    vi.doMock("@/server/db/client", () => {
      const fn = vi.fn(async () => {
        throw new Error("connection refused");
      });
      return {
        sql: fn,
        db: {},
      };
    });
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.database).toBe("error");
  });
});
