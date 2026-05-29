import { sql as dsql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { getEnv } from "@/lib/env";
import type { Tenant } from "@/server/db/schema";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  fileName: string;
  content: string;
  similarity: number;
}

/**
 * Search relevant chunks for a tenant, using pgvector cosine distance.
 *
 * SECURITY-CRITICAL: this is the ONLY place in the codebase that runs a
 * vector similarity query against `document_chunks`. The tenant filter is
 * applied via a parameterised SQL `WHERE` clause and is mandatory — the
 * function takes a `Tenant` object (already validated by `resolveTenant`),
 * not a raw string, so callers cannot bypass tenant resolution.
 *
 * Operators considered: `<=>` (cosine), `<->` (L2), `<#>` (negative inner
 * product). We use `<=>` to match the cosine HNSW index in the schema, and
 * convert distance to a similarity score (1 - distance) for the threshold
 * check and for downstream display.
 */
export async function retrieveChunks(params: {
  tenant: Tenant;
  queryEmbedding: number[];
  topK?: number;
  minScore?: number;
}): Promise<RetrievedChunk[]> {
  const env = getEnv();
  const topK = params.topK ?? env.RAG_TOP_K;
  const minScore = params.minScore ?? env.RAG_MIN_SCORE;

  if (params.queryEmbedding.length !== env.EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Query embedding dimension mismatch: got ${params.queryEmbedding.length}, expected ${env.EMBEDDING_DIMENSIONS}`,
    );
  }

  const vectorLiteral = `[${params.queryEmbedding.join(",")}]`;

  const rows = await db.execute<{
    chunk_id: string;
    document_id: string;
    file_name: string;
    content: string;
    distance: string;
  }>(dsql`
    SELECT
      c.id AS chunk_id,
      c.document_id AS document_id,
      d.file_name AS file_name,
      c.content AS content,
      (c.embedding <=> ${vectorLiteral}::vector) AS distance
    FROM document_chunks c
    INNER JOIN documents d
      ON d.id = c.document_id AND d.tenant_id = ${params.tenant.id}
    WHERE c.tenant_id = ${params.tenant.id}
    ORDER BY c.embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `);

  return rows
    .map((row) => {
      const distance = Number(row.distance);
      const similarity = 1 - distance;
      return {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        fileName: row.file_name,
        content: row.content,
        similarity,
      } satisfies RetrievedChunk;
    })
    .filter((c) => c.similarity >= minScore);
}
