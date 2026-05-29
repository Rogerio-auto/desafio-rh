import { extname } from "node:path";

export type SupportedExtension = ".pdf" | ".docx" | ".xlsx" | ".md" | ".txt";

const SUPPORTED: ReadonlyArray<SupportedExtension> = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".md",
  ".txt",
];

export function isSupportedFile(fileName: string): boolean {
  return SUPPORTED.includes(extname(fileName).toLowerCase() as SupportedExtension);
}

export function getMimeType(fileName: string): string {
  switch (extname(fileName).toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

export async function extractTextFromBuffer(
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const ext = extname(fileName).toLowerCase();
  switch (ext) {
    case ".txt":
    case ".md":
      return normalizeWhitespace(buffer.toString("utf8"));
    case ".pdf":
      return normalizeWhitespace(await extractPdf(buffer));
    case ".docx":
      return normalizeWhitespace(await extractDocx(buffer));
    case ".xlsx":
      return normalizeWhitespace(await extractXlsx(buffer));
    default:
      throw new Error(`Unsupported file extension: ${ext}`);
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  // exceljs ships an older @types/node ref; the Buffer it expects is structurally
  // identical at runtime but reports as incompatible against @types/node 22+.
  // @ts-expect-error - drop once exceljs upgrades its Node typings
  await workbook.xlsx.load(buffer);
  const lines: string[] = [];
  for (const sheet of workbook.worksheets) {
    lines.push(`# Planilha: ${sheet.name}`);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = cell.value;
        if (value === null || value === undefined) return;
        if (typeof value === "object" && "richText" in value) {
          cells.push(value.richText.map((r) => r.text).join(""));
        } else if (typeof value === "object" && "text" in value) {
          cells.push(String((value as { text: unknown }).text));
        } else if (value instanceof Date) {
          cells.push(value.toISOString());
        } else {
          cells.push(String(value));
        }
      });
      if (cells.length > 0) lines.push(cells.join(" | "));
    });
    lines.push("");
  }
  return lines.join("\n");
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
