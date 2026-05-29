import "../helpers/test-env";
import { describe, expect, it } from "vitest";
import { getChatRequestSchema } from "@/server/security/validation";

describe("chat request validation", () => {
  it("accepts a valid payload", () => {
    const schema = getChatRequestSchema();
    const ok = schema.safeParse({
      tenant: "norteverde",
      question: "Como funciona a política de férias?",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects unknown tenant", () => {
    const schema = getChatRequestSchema();
    const bad = schema.safeParse({ tenant: "outraempresa", question: "Olá?" });
    expect(bad.success).toBe(false);
  });

  it("rejects empty question", () => {
    const schema = getChatRequestSchema();
    const bad = schema.safeParse({ tenant: "aurora", question: "" });
    expect(bad.success).toBe(false);
  });

  it("rejects question above max length", () => {
    const schema = getChatRequestSchema();
    const longQuestion = "a".repeat(2001);
    const bad = schema.safeParse({ tenant: "aurora", question: longQuestion });
    expect(bad.success).toBe(false);
  });

  it("trims whitespace", () => {
    const schema = getChatRequestSchema();
    const parsed = schema.safeParse({
      tenant: "vitalys",
      question: "   Olá, dúvida válida.   ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.question).toBe("Olá, dúvida válida.");
    }
  });
});
