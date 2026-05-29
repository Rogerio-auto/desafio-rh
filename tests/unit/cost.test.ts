import "../helpers/test-env";
import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "@/server/ai/cost";

describe("cost estimation", () => {
  it("computes a positive value for non-zero token counts", () => {
    const c = estimateCostUsd({
      embeddingTokens: 1000,
      inputTokens: 2000,
      outputTokens: 500,
    });
    expect(c.totalUsd).toBeGreaterThan(0);
    // (1000 * 0.02 + 2000 * 0.15 + 500 * 0.6) / 1e6 = 0.00062
    expect(c.totalUsd).toBeCloseTo(0.00062, 6);
  });

  it("returns 0 when all tokens are zero", () => {
    const c = estimateCostUsd({
      embeddingTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(c.totalUsd).toBe(0);
  });
});
