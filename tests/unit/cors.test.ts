import "../helpers/test-env";
import { describe, expect, it } from "vitest";
import { buildCorsHeaders, isOriginAllowed } from "@/server/security/cors";

describe("CORS", () => {
  it("allows requests without an Origin header (same-origin)", () => {
    expect(isOriginAllowed(null)).toBe(true);
  });

  it("allows configured origins", () => {
    expect(isOriginAllowed("http://localhost:3000")).toBe(true);
  });

  it("rejects unknown origins", () => {
    expect(isOriginAllowed("https://evil.example")).toBe(false);
  });

  it("does NOT default to * for unknown origins", () => {
    const headers = buildCorsHeaders("https://evil.example");
    const record = headers as Record<string, string>;
    expect(record["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("echoes a valid origin and never *", () => {
    const headers = buildCorsHeaders("http://localhost:3000");
    const record = headers as Record<string, string>;
    expect(record["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
    expect(record["Access-Control-Allow-Origin"]).not.toBe("*");
  });
});
