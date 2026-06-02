import "../helpers/test-env";
import { describe, expect, it } from "vitest";
import { chunkText } from "@/server/rag/chunker";

describe("chunker", () => {
  it("returns a single chunk when text fits the window", () => {
    const chunks = chunkText("Texto curto para teste.", {
      chunkSizeTokens: 500,
      overlapTokens: 50,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("Texto curto para teste.");
    expect(chunks[0]?.tokenCount).toBeGreaterThan(0);
  });

  it("splits long text into overlapping chunks", () => {
    const paragraph = "Política de férias. ".repeat(400);
    const chunks = chunkText(paragraph, {
      chunkSizeTokens: 120,
      overlapTokens: 20,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(120);
      expect(c.content.length).toBeGreaterThan(0);
    }
  });

  it("returns empty array on empty input", () => {
    expect(chunkText("   \n\n  ", { chunkSizeTokens: 200, overlapTokens: 10 })).toEqual(
      [],
    );
  });
});
