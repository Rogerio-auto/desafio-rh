import "../helpers/test-env";
import { describe, expect, it } from "vitest";
import {
  extractTextFromBuffer,
  getMimeType,
  isSupportedFile,
} from "@/server/ingest/parsers";

describe("parsers", () => {
  it("flags supported extensions", () => {
    expect(isSupportedFile("a.pdf")).toBe(true);
    expect(isSupportedFile("a.PDF")).toBe(true);
    expect(isSupportedFile("a.docx")).toBe(true);
    expect(isSupportedFile("a.xlsx")).toBe(true);
    expect(isSupportedFile("a.md")).toBe(true);
    expect(isSupportedFile("a.txt")).toBe(true);
    expect(isSupportedFile("a.zip")).toBe(false);
    expect(isSupportedFile("README")).toBe(false);
  });

  it("returns sensible MIME types", () => {
    expect(getMimeType("a.pdf")).toContain("pdf");
    expect(getMimeType("a.docx")).toContain("wordprocessingml");
    expect(getMimeType("a.xlsx")).toContain("spreadsheetml");
    expect(getMimeType("a.md")).toBe("text/markdown");
    expect(getMimeType("a.txt")).toBe("text/plain");
  });

  it("extracts text from a TXT buffer", async () => {
    const buf = Buffer.from("Linha 1\nLinha 2\n  Linha 3  ", "utf8");
    const text = await extractTextFromBuffer("file.txt", buf);
    expect(text).toContain("Linha 1");
    expect(text).toContain("Linha 3");
    expect(text).not.toMatch(/  Linha 3  /);
  });

  it("extracts text from a Markdown buffer", async () => {
    const md = "# Título\n\nParágrafo com **negrito** e *itálico*.";
    const text = await extractTextFromBuffer("policy.md", Buffer.from(md));
    expect(text).toContain("Título");
    expect(text).toContain("Parágrafo");
  });
});
