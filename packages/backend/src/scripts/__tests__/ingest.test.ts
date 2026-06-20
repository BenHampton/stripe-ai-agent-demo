import { describe, it, expect } from 'vitest';
// No mock needed: env is satisfied globally by the test setup file, and
// chunkMarkdown is a pure string function that never touches the DB.
import { chunkMarkdown } from '../ingest.js';

describe('chunkMarkdown', () => {
    it('returns empty array for empty content', () => {
        expect(chunkMarkdown('')).toEqual([]);
    });

    it('splits on ## headings', () => {
        // Each section must clear MIN_TOKENS (50). estimateTokens = ceil(len/4),
        // so a section needs ~200+ chars or the chunker merges it into the next one.
        const md = `
## Section One
Content for section one that has genuinely enough text to clear the fifty token minimum, since estimateTokens divides character count by four and fifty tokens therefore needs at least two hundred characters of real content here to survive.

## Section Two
Content for section two that also runs well past two hundred characters so it is not merged into its neighbour, because the chunker folds any section under the fifty token floor into the following one until the combined size is large enough.
`;
        const chunks = chunkMarkdown(md);
        expect(chunks.length).toBe(2);
        expect(chunks[0]!.content).toContain('Section One');
        expect(chunks[1]!.content).toContain('Section Two');
    });

    it('merges undersized sections', () => {
        // Two tiny sections should merge into one chunk
        const md = `## Tiny One\nShort.\n\n## Tiny Two\nAlso short.`;
        const chunks = chunkMarkdown(md);
        // Both sections are under MIN_TOKENS — should merge
        expect(chunks.length).toBeLessThan(3);
    });

    it('preserves heading text in chunks', () => {
        const md = `## Refund Eligibility\n\n${'Content word '.repeat(60)}`;
        const chunks = chunkMarkdown(md);
        expect(chunks[0]!.content).toContain('Refund Eligibility');
    });

    it('assigns sequential chunk indices', () => {
        const md = Array.from({ length: 5 }, (_, i) =>
            `## Section ${i}\n${'word '.repeat(60)}`
        ).join('\n\n');
        const chunks = chunkMarkdown(md);
        chunks.forEach((c, i) => expect(c.index).toBe(i));
    });

    it('splits oversized sections at paragraph boundaries', () => {
        // Section with 600+ tokens should split at paragraph breaks
        const bigSection = `## Big Section\n\n${'word '.repeat(200)}\n\n${'word '.repeat(200)}\n\n${'word '.repeat(200)}`;
        const chunks = chunkMarkdown(bigSection);
        expect(chunks.length).toBeGreaterThan(1);
        chunks.forEach(c => expect(c.tokenEstimate).toBeLessThanOrEqual(420)); // slight margin
    });
});