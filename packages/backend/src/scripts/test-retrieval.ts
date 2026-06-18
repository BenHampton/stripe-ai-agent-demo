// Quick retrieval test — run with: tsx --env-file=../../.env src/scripts/test-retrieval.ts
import { retrieve } from '../services/rag.js';

const testQueries = [
    `Can I get a refund for last month's charge?`,
    `What is the difference between Pro and Enterprise?`,
    `How do I cancel my subscription?`,
    `My payment failed, what happens now?`,
];

for (const query of testQueries) {
    console.log(`
Query: "${query}"`);
    console.log(`${'─'.repeat(60)}`);
    const chunks = await retrieve(query, { topK: 3 });
    if (chunks.length === 0) {
        console.log(`  No results above threshold`);
    } else {
        chunks.forEach((chunk, i) => {
            console.log(`  [${i + 1}] score=${chunk.score.toFixed(3)} | ${chunk.filename}`);
            console.log(`       ${chunk.content.slice(0, 120).replace(/\n/g, ' ')}...`);
        });
    }
}