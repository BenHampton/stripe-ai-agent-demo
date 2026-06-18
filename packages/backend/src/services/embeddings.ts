import { VoyageAIClient } from 'voyageai';

import { env } from '@sai/shared';

// Voyage distinguishes documents (stored) from queries (searched).
// Using the right input type for each improves retrieval quality measurably.
export type InputType = 'document' | 'query';

export interface EmbeddingProvider {
    readonly dimensions: number
    readonly modelName: string
    embed(text: string, inputType?: InputType): Promise<number[]>;
    embedBatch(texts: string[], inputType?: InputType): Promise<number[][]>;
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

    async embed(text: string, inputType: InputType = 'document'): Promise<number[]> {
        const results = await this.embedBatch([text], inputType);
        const result = results[0];
        if (!result) {
            throw new Error('Embedding returned no results');
        }

        return result;
    }

    async embedBatch(texts: string[], inputType: InputType = 'document'): Promise<number[][]> {
        if (texts.length === 0) {
            return [];
        }

        // Split into chunks to respect API batch limits
        const batches = chunkArray(texts, VoyageEmbeddingProvider.BATCH_SIZE);
        const allEmbeddings: number[][] = [];

        for (const batch of batches) {
            // embedWithRetry handles Voyage 429 rate limits with exponential backoff.
            // Free-tier Voyage accounts are capped at 3 RPM until a payment method
            // is added — without retry, ingestion fails on the 4th call onward.
            const response = await this.embedWithRetry(batch, inputType);

            // EmbedResponse shape: { data: EmbedResponseDataItem[] }
            // Each item has .embedding (number[]) and .index (for ordering).
            // Sort by index to guarantee order matches input batch order.
            const embeddings: number[][] = (response.data ?? [])
                .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
                .map(item => item.embedding ?? []);
            allEmbeddings.push(...embeddings);
        }

        return allEmbeddings;
    }

    // Call Voyage embed() with exponential backoff on 429 (rate limit) errors.
    // Voyage free tier: 3 RPM / 10K TPM until a payment method is added.
    // Retries: waits 2s, 4s, 8s, 16s, 32s (5 attempts) before giving up.
    private async embedWithRetry(batch: string[], inputType: InputType, maxRetries = 5) {
        let lastErr: unknown;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await this.client.embed({
                    model: this.modelName,
                    input: batch,
                    inputType, // 'document' for KB ingestion, 'query' for searches
                });
            } catch (err: any) {
                lastErr = err;
                // Voyage SDK surfaces HTTP status on err.statusCode (Fern client)
                const status = err?.statusCode ?? err?.status;
                if (status !== 429 || attempt === maxRetries) {
                    throw err;
                }
                // TODO replace 2000 with throttleMs.. maybe??
                // const throttleMs = Number(process.env.INGEST_THROTTLE_MS ?? 21000);
                const waitMs = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s, 32s
                process.stdout.write(`(rate limited, retrying in ${waitMs / 1000}s) \n`);
                await new Promise(r => setTimeout(r, waitMs));
            }
        }
        throw lastErr;
    }
}

// Mocking Provider for Testing
export class MockEmbeddingProvider implements EmbeddingProvider {
    readonly dimensions = 1024;
    readonly modelName = 'mock';

    async embed(text: string, _inputType: InputType = 'document'): Promise<number[]> {
        // Deterministic mock: same text → same vector. inputType ignored in mock.
        return this.deterministicVector(text);
    }

    async embedBatch(texts: string[], inputType: InputType = 'document'): Promise<number[][]> {
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

let _provider: EmbeddingProvider | undefined;

export function getEmbeddingProvider(): EmbeddingProvider {
    if (!_provider) {
        // In test environments, use the mock to avoid API calls
        _provider = env.NODE_ENV === 'test'
            ? new MockEmbeddingProvider()
            : new VoyageEmbeddingProvider();
    }
    return _provider;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
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