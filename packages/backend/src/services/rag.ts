import { sql } from 'drizzle-orm';
import { env, getDb, kbChunks } from '@sai/shared';
import type { RagChunk } from '@sai/shared';
import { getEmbeddingProvider, vectorToString } from './embeddings.js';

// Re-export chunkMarkdown so the RAG tool can import from one place
export { chunkMarkdown } from '../scripts/ingest.js';

export interface RetrievalOptions {
    topK?: number //Maximum number of chunks to return. Default: 5
    minScore?: number // Minimum similarity score (0–1). Chunks below this are excluded. Default: 0.65
    category?: string //Filter to a specific category. Optional.
}

// Retrieve the most relevant KB chunks for the given query
export async function retrieve(
    query: string,
    options: RetrievalOptions = {},
): Promise<RagChunk[]> {
    const { topK = 5, minScore = 0.65, category } = options

    const embedder = getEmbeddingProvider()
    const db = getDb(env.DATABASE_URL)

    // Embed the query using 'query' input_type for better retrieval quality.
    // This is different from the 'document' type used during ingestion.
    const queryVector = await embedder.embed(query, 'query')
    const vectorStr = vectorToString(queryVector)

    // pgvector cosine distance query.
    // The <=> operator computes cosine distance (0 = identical, 2 = opposite).
    // We convert to similarity: similarity = 1 - (distance / 2).
    // The HNSW index is used automatically when the operator matches the index type.
    const categoryFilter = category
        ? sql`AND category = ${category}`
        : sql``

    const results = await db.execute(sql`
    SELECT
      id,
      filename,
      title,
      category,
      content,
      chunk_index,
      1 - (embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}) AS similarity
    FROM kb_chunks
    WHERE 1 - (embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}) >= ${minScore}
    ${categoryFilter}
    ORDER BY embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}
    LIMIT ${topK}
  `);

    return results.rows.map((row: any) => ({
        chunkId:  row.id as string,
        filename: row.filename as string,
        title:    row.title as string,
        score:    parseFloat(row.similarity),
        content:  row.content as string,
    }));
}

// Format retrieved chunks into a context block for inclusion in agent prompts
export function formatRagContext(chunks: RagChunk[]): string {
    if (chunks.length === 0) {
        return 'No relevant knowledge base content found for this query.';
    }

    const formatted = chunks.map((chunk, i) => (
        `[Source ${i + 1}: ${chunk.title} | ${chunk.filename} | score: ${chunk.score.toFixed(3)}]\n${chunk.content}`
    )).join('\n\n---\n\n');

    return `KNOWLEDGE BASE CONTEXT:\n\n${formatted}`;
}