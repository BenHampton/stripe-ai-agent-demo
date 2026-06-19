// This MUST be the first import — validates all env vars before anything else runs.
// If validation fails, the process exits here with a descriptive error message.
import { env } from '@sai/shared';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import {webhooksRouter} from "./routes/webhooks.js";
import {approvalsRouter} from "./routes/approvals.js";
import {retentionRouter} from "./routes/retention.js";
import {dashboardRouter} from "./routes/dashboard.js";
// hono/logger is Hono's built-in request logger — no extra file needed.
// The structured pino logger (application-level) is added in Section 19.

const app = new Hono();

// app.use('*', cors({ origin: env.ALLOWED_ORIGINS.split(','), allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'] }));
app.get('/health', (c) => c.json(
    { status: 'ok', ts: new Date().toISOString() }
));

// Middleware
app.use('*', logger());

// Routes
app.get('/', (c) => c.json({
    status: 'ok', service: 'stripe-ai-agent-demo'
}));

app.route('/api/retention', retentionRouter);

// Stripe webhooks, no JWT (Stripe signs its own requests)
app.route('/api/webhooks/stripe', webhooksRouter);

// Protected routes
app.route('/api/approvals', approvalsRouter);

app.route('/api/dashboard', dashboardRouter);

const port = env.PORT;

serve({ fetch: app.fetch, port }, () => {
    process.stdout.write(`Backend running on http://localhost:${port}\n`);
});

export default app;