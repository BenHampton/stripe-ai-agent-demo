import { VoyageAIClient } from 'voyageai';

import { env } from '@sai/shared';

/**
 * EmbeddingProvider interface.
 *
 * Every concrete provider implements this. Code that needs embeddings
 * depends on this interface — not on any specific provider.
 *
 * The dimensions property is critical: it must match the pgvector column
 * size in schema.ts (currently vector(1024) for voyage-3-large).
 * If you switch providers, update both this and the migration.
 *
 * NOTE: Voyage embeddings were never available through the Anthropic SDK.
 * Use the official voyageai npm package (api.voyageai.com/v1/embeddings).
 * Add VOYAGE_API_KEY to your .env — separate from ANTHROPIC_API_KEY.
 */
export interface EmbeddingProvider {
    readonly dimensions: number
    readonly modelName: string
    embed(text: string): Promise<number[]>
    embedBatch(texts: string[]): Promise<number[][]>
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
    readonly dimensions = 1024
    readonly modelName = 'voyage-3-large'

    private readonly client: InstanceType<typeof VoyageAIClient>;

    // Maximum texts part batch - Voyage API limit
    private static readonly BATCH_SIZE = 128

    constructor() {
        this.client = new VoyageAIClient({ apiKey: env.VOYAGE_API_KEY })
    }

    async embed(text: string): Promise<number[]> {
        const results = await this.embedBatch([text]);
        const result = results[0];
        if (!result) {
            throw new Error('Embedding returned no results');
        }

        return result;
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) {
            return [];
        }

        // Split into chunks to respect API batch limits
        const batches = chunkArray(texts, VoyageEmbeddingProvider.BATCH_SIZE);
        const allEmbeddings: number[][] = [];

        for (const batch of batches) {
            // voyageai SDK: client.embed() returns EmbedResponse with .embeddings[]
            const response = await this.client.embed({
                model: this.modelName,
                input: batch,
                inputType: 'document', // use 'query' when embedding search queries
            });

            const embeddings: number[][] = (response.data ?? [])
                .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
                .map(item => item.embedding ?? []);

            allEmbeddings.push(...embeddings);
        }

        return allEmbeddings;
    }
}

// Mocking Provider for Testing
export class MockEmbeddingProvider implements EmbeddingProvider {
    readonly dimensions = 1024;
    readonly modelName = 'mock';

    async embed(text: string): Promise<number[]> {
        // Deterministic mock: same text → same vector. Random but consistent.
        return this.deterministicVector(text);
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        return Promise.all(texts.map((t) => this.embed(t)));
    }

    private deterministicVector(text: string): number[] {
        // Simple hash-based vector — NOT suitable for real similarity search,
        // only for tests that verify the RAG pipeline wiring, not its quality.
        let seed = 0;
        for (let i = 0; i < text.length; i++) {
            seed = (seed * 31 + text.charCodeAt(i)) | 0;
        }
        return Array.from({ length: this.dimensions }, (_, i) => {
            const x = Math.sin(seed + i) * 10000;
            return x - Math.floor(x);
        });
    }
}

// Singleton factory

let _provider: EmbeddingProvider | undefined

export function getEmbeddingProvider(): EmbeddingProvider {
    if (!_provider) {
        // In test environments, use the mock to avoid API calls
        _provider = env.NODE_ENV === 'test'
            ? new MockEmbeddingProvider()
            : new VoyageEmbeddingProvider()
    }

    return _provider
}

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = []

    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size))
    }

    return chunks
}

/**
 * Convert a vector (number[]) to the pgvector string format.
 * pgvector expects: [0.1, 0.2, 0.3, ...]
 * This is what gets stored in the database.
 */
export function vectorToString(vector: number[]): string {
    return `[${vector.join(',')}]`;
}

/**
 * For future Ollama implementation:
 *
 * export class OllamaEmbeddingProvider implements EmbeddingProvider {
 *   readonly dimensions = 768; // nomic-embed-text dimensions
 *   readonly modelName = 'nomic-embed-text';
 *
 *   async embed(text: string): Promise<number[]> {
 *     const response = await fetch('http://localhost:11434/api/embeddings', {
 *       method: 'POST',
 *       body: JSON.stringify({ model: this.modelName, prompt: text }),
 *     });
 *     const data = await response.json();
 *     return data.embedding;
 *   }
 *
 *   async embedBatch(texts: string[]): Promise<number[][]> {
 *     return Promise.all(texts.map(t => this.embed(t)));
 *   }
 * }
 *
 * IMPORTANT: switching from voyage-3-large (1024 dims) to nomic-embed-text (768 dims)
 * requires: (1) updating the vector(1024) column to vector(768) in a new migration,
 * (2) re-running `pnpm ingest` to re-embed all KB documents.
 * The HNSW index must also be dropped and recreated for the new dimensions.
 */