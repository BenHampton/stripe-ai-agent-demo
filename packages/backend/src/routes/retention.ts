import { Hono } from 'hono';
import { runProactiveRetentionScan } from '../agents/proactive-retention.js';

export const retentionRouter = new Hono();

// POST /api/retention/scan - trigger proactive retention scan
retentionRouter.post('/scan', async (c) => {
    // Run scan fire-and-forget for fast response
    const startTime = Date.now();
    const result = await runProactiveRetentionScan();
    return c.json({ ...result, durationMs: Date.now() - startTime });
});