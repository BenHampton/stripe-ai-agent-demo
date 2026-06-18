-- Enable pgvector extension (idempotent — safe to run multiple times)
CREATE EXTENSION IF NOT EXISTS vector;

-- Convert the embedding column from text to vector(1024)
-- 1024 = voyage-3-large embedding dimensions
-- If you switch to a different model, update this number and re-embed.
ALTER TABLE kb_chunks
ALTER COLUMN embedding TYPE vector(1024)
USING embedding::vector(1024);

-- HNSW index for approximate nearest-neighbor search.
-- HNSW (Hierarchical Navigable Small World) is faster than IVFFlat for
-- query time at the cost of higher build time and memory.
-- For a KB with < 100k chunks, HNSW is the right choice.
--
-- cosine distance (vector_cosine_ops) matches voyage-3-large's output space.
-- Use L2 (vector_l2_ops) only if your embeddings are explicitly normalized.
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_hnsw_idx
    ON kb_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- m = 16: number of bi-directional links per node (higher = better recall, more memory)
-- ef_construction = 64: size of dynamic candidate list during build (higher = better quality)
-- These are pgvector's recommended defaults for most use cases.
