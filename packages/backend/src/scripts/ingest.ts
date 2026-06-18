/**
 * Knowledge Base Ingestion CLI
 *
 * Usage:
 *   pnpm ingest                    # ingest all docs in knowledge-base/
 *   pnpm ingest --force            # re-embed all docs even if unchanged
 *   pnpm ingest --file refund-policy.md  # ingest a single file
 *
 * The script is idempotent: running it twice produces the same result.
 * Changed documents are detected via SHA-256 content hash — only changed
 * docs are re-embedded, saving API calls and time.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import { eq } from 'drizzle-orm';
import { env, getDb, kbDocuments, kbChunks } from '@sai/shared';
import { getEmbeddingProvider, vectorToString } from '../services/embeddings.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FrontMatter {
    title: string;
    category: string;
    version: string;
    last_updated: string;
    description: string;
}

interface Chunk {
    content: string;
    index: number;
    tokenEstimate: number;
}

// ── Markdown-Aware Chunker ────────────────────────────────────────────────────

/**
 * Split markdown content into chunks at heading and paragraph boundaries.
 *
 * Strategy:
 * 1. Split on ## headings — each section becomes a candidate chunk
 * 2. If a section exceeds MAX_TOKENS, split further at paragraph breaks
 * 3. If a section is under MIN_TOKENS, merge it with the next section
 *
 * This keeps semantically related content together while preventing
 * chunks that are too large for the context window or too small to
 * have meaningful retrieval signal.
 */
const MIN_TOKENS = 50;
const MAX_TOKENS = 400;

function estimateTokens(text: string): number {
    // Rough approximation: ~4 chars per token (GPT-4 / Claude rule of thumb)
    // Good enough for chunking decisions — not for billing calculations.
    return Math.ceil(text.length / 4);
}

export function chunkMarkdown(content: string): Chunk[] {
    // Split on ## headings (h2). We treat the document as a set of sections,
    // where each section starts at a ## heading. The h1 title (from frontmatter)
    // is not included — it's already in the metadata.
    const sectionRegex = /^## .+$/m;
    const rawSections = content
        .split(sectionRegex)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    // Re-attach headings to their sections
    const headingMatches = [...content.matchAll(/^(## .+)$/gm)];
    const sections: string[] = rawSections.map((section, i) => {
        const heading = headingMatches[i]?.[0] ?? '';
        return heading ? `${heading}

${section}` : section;
    });

    const chunks: string[] = [];

    for (const section of sections) {
        const tokens = estimateTokens(section);

        if (tokens <= MAX_TOKENS) {
            // Section fits in one chunk — add as-is
            chunks.push(section);
        } else {
            // Section too large — split at paragraph breaks
            const paragraphs = section.split(/\n\n+/).filter(p => p.trim().length > 0);
            let current = '';

            for (const para of paragraphs) {
                const combined = current ? `${current}

${para}` : para;
                if (estimateTokens(combined) <= MAX_TOKENS) {
                    current = combined;
                } else {
                    if (current) chunks.push(current);
                    current = para;
                }
            }
            if (current) chunks.push(current);
        }
    }

    // Merge undersized chunks with the next chunk
    const merged: string[] = [];
    let carry = '';

    for (const chunk of chunks) {
        const combined = carry ? `${carry}

${chunk}` : chunk;
        if (estimateTokens(combined) < MIN_TOKENS) {
            carry = combined; // still too small — keep accumulating
        } else {
            merged.push(combined);
            carry = '';
        }
    }
    if (carry) merged.push(carry); // flush remaining content

    return merged.map((content, index) => ({
        content,
        index,
        tokenEstimate: estimateTokens(content),
    }));
}

// ── Content Hashing ───────────────────────────────────────────────────────────

function hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
}

// ── Main Ingestion Logic ──────────────────────────────────────────────────────

async function ingestFile(
    filePath: string,
    db: ReturnType<typeof getDb>,
    embedder: ReturnType<typeof getEmbeddingProvider>,
    options: { force: boolean },
): Promise<{ skipped: boolean; chunksWritten: number }> {
    const filename = basename(filePath);
    const raw = readFileSync(filePath, 'utf8');
    // matter() returns GrayMatterFile which doesn't overlap with { data: FrontMatter }
    // enough for a direct cast. Cast through unknown first, then validate fields below.
    const { data, content } = matter(raw);
    const frontmatter: FrontMatter = {
        title:        String(data['title'] ?? ''),
        category:     String(data['category'] ?? ''),
        version:      String(data['version'] ?? ''),
        last_updated: String(data['last_updated'] ?? ''),
        description:  String(data['description'] ?? ''),
    };

    // Validate required frontmatter fields
    const required = ['title', 'category', 'version'] as const;
    for (const field of required) {
        if (!frontmatter[field]) {
            throw new Error(`Missing required frontmatter field "${field}" in ${filename}`);
        }
    }

    const contentHash = hashContent(raw);

    // Check if document has changed since last ingestion
    const existing = await db
        .select({ id: kbDocuments.id, contentHash: kbDocuments.contentHash })
        .from(kbDocuments)
        .where(eq(kbDocuments.filename, filename))
        .limit(1);

    if (existing[0]?.contentHash === contentHash && !options.force) {
        return { skipped: true, chunksWritten: 0 };
    }

    // Chunk the document
    const chunks = chunkMarkdown(content);

    if (chunks.length === 0) {
        console.warn(`  ⚠ No chunks produced for ${filename} — is the content empty?`);
        return { skipped: false, chunksWritten: 0 };
    }

    // Throttle before the embedding call to respect Voyage free-tier limits (3 RPM).
    // Placed here (not in the file loop) so skipped/unchanged files are instant —
    // only files that actually call the Voyage API get paced.
    // Set INGEST_THROTTLE_MS=0 in .env once you add a Voyage payment method.
    const throttleMs = Number(process.env.INGEST_THROTTLE_MS ?? 21000);
    if (throttleMs > 0) {
        await new Promise(r => setTimeout(r, throttleMs));
    }

    // Embed all chunks in one batch call
    const embeddings = await embedder.embedBatch(chunks.map(c => c.content));

    // Upsert document record
    // onConflictDoUpdate handles both insert (new doc) and update (changed doc)
    const docResult = await db
        .insert(kbDocuments)
        .values({
            filename,
            title: frontmatter.title,
            category: frontmatter.category,
            version: frontmatter.version,
            contentHash,
            chunkCount: chunks.length,
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: kbDocuments.filename,
            set: {
                title: frontmatter.title,
                category: frontmatter.category,
                version: frontmatter.version,
                contentHash,
                chunkCount: chunks.length,
                updatedAt: new Date(),
            },
        })
        .returning();

    const documentId = docResult[0]?.id;
    if (!documentId) throw new Error(`Failed to upsert document record for ${filename}`);

    // Delete old chunks for this document before inserting new ones.
    // This handles the case where chunking produces fewer chunks than before
    // (e.g. document was shortened) — orphaned chunks would corrupt retrieval.
    await db.delete(kbChunks).where(eq(kbChunks.documentId, documentId));

    // Insert new chunks
    const chunkRows = chunks.map((chunk, i) => ({
        documentId,
        filename,
        title: frontmatter.title,
        category: frontmatter.category,
        chunkIndex: chunk.index,
        content: chunk.content,
        embedding: vectorToString(embeddings[i] ?? []),
        tokenCount: chunk.tokenEstimate,
    }));

    // Insert in batches to avoid hitting Postgres parameter limits
    // (Postgres max is 65535 parameters; 1024 dims * ~60 chunks exceeds this)
    const INSERT_BATCH = 50;
    for (let i = 0; i < chunkRows.length; i += INSERT_BATCH) {
        await db.insert(kbChunks).values(chunkRows.slice(i, i + INSERT_BATCH));
    }

    return { skipped: false, chunksWritten: chunks.length };
}

// ── CLI Entry Point ───────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const force = args.includes('--force');
    const fileArg = args.find(a => a.startsWith('--file='))?.split('=')[1];

    const kbDir = resolve(process.cwd(), '../../knowledge-base');
    const db = getDb(env.DATABASE_URL);
    const embedder = getEmbeddingProvider();

    console.log(`
📚 Knowledge Base Ingestion`);
    console.log(`   Provider: ${embedder.modelName} (${embedder.dimensions} dims)`);
    console.log(`   Mode:     ${force ? 'force re-embed all' : 'upsert (skip unchanged)'}
`);

    // Collect files to process
    let files: string[];

    if (fileArg) {
        const fullPath = join(kbDir, fileArg);
        files = [fullPath];
    } else {
        files = readdirSync(kbDir)
            .filter(f => f.endsWith('.md') && !f.startsWith('_')) // skip _template.md
            .map(f => join(kbDir, f))
            .filter(f => statSync(f).isFile());
    }

    if (files.length === 0) {
        console.log(`No markdown files found in ${kbDir}`);
        process.exit(0);
    }

    console.log(`Found ${files.length} file(s) to process
`);

    let totalChunks = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const filePath of files) {
        const filename = basename(filePath);
        process.stdout.write(`  Processing ${filename}... `);

        try {
            const result = await ingestFile(filePath, db, embedder, { force });
            if (result.skipped) {
                process.stdout.write(`skipped (unchanged)
`);
                skippedCount++;
            } else {
                process.stdout.write(`✓ ${result.chunksWritten} chunks
`);
                totalChunks += result.chunksWritten;
            }
        } catch (err) {
            process.stdout.write(`✗ ERROR
`);
            console.error(`    ${err instanceof Error ? err.message : String(err)}
`);
            errorCount++;
        }
    }

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Ingestion complete
   Chunks written: ${totalChunks}
   Files skipped:  ${skippedCount}
   Errors:         ${errorCount}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    if (errorCount > 0) process.exit(1);
}

// Only run ingestion when this file is executed directly (e.g. `pnpm ingest`),
// NOT when another module imports chunkMarkdown from it. Without this guard,
// importing chunkMarkdown (via rag.ts) triggers a full ingestion run as a side
// effect — re-embedding every document on any import of the retrieval path.
const isMain = !!process.argv[1] &&
    import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
    main().catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}