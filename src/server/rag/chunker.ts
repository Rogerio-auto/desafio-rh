import { encoding_for_model, type TiktokenModel } from "tiktoken";

export interface Chunk {
  index: number;
  content: string;
  tokenCount: number;
}

export interface ChunkOptions {
  chunkSizeTokens: number;
  overlapTokens: number;
  encodingModel?: TiktokenModel;
}

/**
 * Token-aware chunker with overlap. Uses tiktoken for an accurate count so
 * chunks line up well with the LLM's context window. Free instances are
 * disposed after use — tiktoken backs them with WASM memory.
 *
 * Soft preference: end chunks at paragraph or sentence boundaries when one
 * lands inside the last 15% of the window. Pure byte-windowing cuts mid-word
 * and degrades retrieval quality.
 */
export function chunkText(text: string, opts: ChunkOptions): Chunk[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  const enc = encoding_for_model(opts.encodingModel ?? "gpt-4o-mini");
  try {
    const tokens = enc.encode(cleaned);
    if (tokens.length === 0) return [];
    if (tokens.length <= opts.chunkSizeTokens) {
      return [
        {
          index: 0,
          content: cleaned,
          tokenCount: tokens.length,
        },
      ];
    }

    const chunks: Chunk[] = [];
    const decoder = new TextDecoder();
    let start = 0;
    let index = 0;
    while (start < tokens.length) {
      let end = Math.min(start + opts.chunkSizeTokens, tokens.length);
      const slice = tokens.slice(start, end);
      let content = decoder.decode(enc.decode(slice));

      const lookbackWindow = Math.floor(content.length * 0.15);
      if (end < tokens.length && lookbackWindow > 0) {
        const lookbackStart = content.length - lookbackWindow;
        const lastBreak = Math.max(
          content.lastIndexOf("\n\n", content.length - 1),
          content.lastIndexOf(". ", content.length - 1),
          content.lastIndexOf("\n", content.length - 1),
        );
        if (lastBreak > lookbackStart) {
          content = content.slice(0, lastBreak + 1).trimEnd();
          const reencoded = enc.encode(content);
          end = start + reencoded.length;
        }
      }

      const trimmed = content.trim();
      if (trimmed.length > 0) {
        chunks.push({
          index,
          content: trimmed,
          tokenCount: end - start,
        });
        index += 1;
      }

      if (end >= tokens.length) break;
      start = Math.max(end - opts.overlapTokens, start + 1);
    }
    return chunks;
  } finally {
    enc.free();
  }
}
