// This MUST be the first import — validates all env vars before anything else runs.
// If validation fails, the process exits here with a descriptive error message.
import { env } from '@sai/shared';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
// hono/logger is Hono's built-in request logger — no extra file needed.
// The structured pino logger (application-level) is added in Section 19.

const app = new Hono();

// Middleware
app.use('*', logger());

// Routes will be added in subsequent sections
app.get('/', (c) => c.json({ status: 'ok', service: 'stripe-ai-agent-demo' }));

const port = env.PORT;

serve({ fetch: app.fetch, port }, () => {
    process.stdout.write(`Backend running on http://localhost:${port}\n`);
});

export default app;