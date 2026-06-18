// Retrieval diagnostic — run with: pnpm --filter @sai/backend test-retrieval
// Probes the KB with a low floor so you can see ALL candidate scores, then
// labels each against the configured threshold. Useful for tuning minScore.
import { retrieve } from '../services/rag.js';
import {env} from "@sai/shared";

// The real production threshold — change here to see how it would filter.
const THRESHOLD = env.RAG_MIN_SCORE;

// Probe floor: query well below THRESHOLD so we can see near-misses too.
const PROBE_FLOOR = 0.3;

const testQueries = [
    "Can I get a refund for last month's charge?",
    'What is the difference between Pro and Enterprise?',
    'How do I cancel my subscription?',
    'My payment failed, what happens now?',
];

// Map a raw cosine score to a human-readable confidence label.
function confidence(score: number): string {
    if (score >= 0.70) return 'HIGH';
    if (score >= 0.60) return 'MEDIUM';
    if (score >= 0.50) return 'LOW';
    return 'NOISE';
}

console.log("Running `test-retrieval.ts`, Testing With Config:")
console.log("threshold: " + THRESHOLD)
console.log("topK: " + env.RAG_TOP_K)
console.log("minScore: " + PROBE_FLOOR)

for (const query of testQueries) {
    console.log(`\nQuery: "${query}"`);
    console.log(`Threshold: ${THRESHOLD}  (probe floor: ${PROBE_FLOOR})`);
    console.log(`${'─'.repeat(64)}`);

    // Probe with the low floor so we can see chunks that the real
    // threshold would reject — those are the most useful for tuning.
    const chunks = await retrieve(query, { topK: env.RAG_TOP_K, minScore: PROBE_FLOOR });

    if (chunks.length === 0) {
        console.log(`  ✗ No chunks even above probe floor ${PROBE_FLOOR} — query has no KB match at all.`);
        continue;
    }

    const passing = chunks.filter(c => c.score >= THRESHOLD);
    console.log(`  ${passing.length}/${chunks.length} chunks pass threshold ${THRESHOLD}`);

    chunks.forEach((chunk, i) => {
        const pass = chunk.score >= THRESHOLD ? '✓' : '✗ (filtered)';
        const conf = confidence(chunk.score);
        const preview = chunk.content.slice(0, 90).replace(/\n/g, ' ');
        console.log(
            `  [${i + 1}] ${pass}  score=${chunk.score.toFixed(3)}  conf=${conf}  | ${chunk.filename}`,
        );
        console.log(`       ${preview}...`);
    });
}
