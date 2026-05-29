import "../helpers/test-env";
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/server/ai/chat";

describe("chat prompt", () => {
  it("system prompt instructs Portuguese-only answers", () => {
    expect(SYSTEM_PROMPT).toMatch(/português/i);
  });

  it("system prompt forbids using knowledge outside context", () => {
    expect(SYSTEM_PROMPT).toMatch(/apenas as informações presentes/i);
  });

  it("system prompt requires explicit no-evidence wording", () => {
    expect(SYSTEM_PROMPT).toMatch(/Não encontrei evidência documental suficiente/);
  });

  it("user prompt cites file names per chunk", () => {
    const prompt = buildUserPrompt("Quantos dias de férias?", [
      { fileName: "Politica_Ferias_v2.docx", content: "30 dias após 12 meses." },
      { fileName: "Manual_RH.pdf", content: "Conforme CLT." },
    ]);
    expect(prompt).toContain("Politica_Ferias_v2.docx");
    expect(prompt).toContain("Manual_RH.pdf");
    expect(prompt).toContain("Quantos dias de férias?");
  });

  it("user prompt indicates empty context explicitly", () => {
    const prompt = buildUserPrompt("Pergunta sem contexto?", []);
    expect(prompt).toContain("nenhum documento relevante encontrado");
  });
});
