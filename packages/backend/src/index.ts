// This MUST be the first import — validates all env vars before anything else runs.
// If validation fails, the process exits here with a descriptive error message.
import {env, getDb} from '@sai/shared';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from './lib/logger.js';
import {webhooksRouter} from "./routes/webhooks.js";
import {approvalsRouter} from "./routes/approvals.js";
import {retentionRouter} from "./routes/retention.js";
import {dashboardRouter} from "./routes/dashboard.js";
import { simulateRouter } from './routes/simulate.js';
import {apiKeyAuth, jwtAuth, tokenHandler} from "./middleware/auth.js";
import {sql} from "drizzle-orm";
import {chatRouter} from "./routes/chat.js";

const app = new Hono();

app.use('*', cors({ origin: env.ALLOWED_ORIGINS.split(','), allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'] }));

// Public Routes
app.get('/health', async (c) => {
    try {
        await getDb(env.DATABASE_URL).execute(sql`SELECT 1`);
        return c.json({ status: 'ok', db: 'ok', ts: new Date().toISOString() });
    } catch {
        c.status(503); return c.json({ status: 'degraded', db: 'unreachable' });
    }
});

// Token issuance (demo-safe: any customer_id, no password)
app.post('/api/auth/token', async (c) => {
    const { customer_id } = await c.req.json<{ customer_id: string }>();
    if (!customer_id) { c.status(400); return c.json({ error: 'customer_id required' }); }
    return c.json(await tokenHandler(customer_id));
});

// Stripe webhooks - verified by Stripe signature, not JWT
app.route('/api/webhooks/stripe', webhooksRouter);

// JWT-protected routes
app.use('/api/chat/*', jwtAuth);
app.route('/api/chat', chatRouter);

// API-key-protected (admin / cron / internal) Routes
app.use('/api/approvals/*',  apiKeyAuth);
app.use('/api/dashboard/*',  apiKeyAuth);
app.use('/api/retention/*',  apiKeyAuth);
app.use('/api/simulate/*', apiKeyAuth);
app.route('/api/approvals',  approvalsRouter);
app.route('/api/dashboard',  dashboardRouter);
app.route('/api/retention',  retentionRouter);
app.route('/api/simulate', simulateRouter);

// Central error handler — any unhandled error thrown in a route lands here and is
// logged once, with context, through the structured logger. Beats try/catch in every
// route: one place to log, one place to shape the client-facing error response.
app.onError((err, c) => {
    logger.error(
        { err: err.message, path: c.req.path, method: c.req.method },
        'unhandled request error',
    );
    c.status(500);
    return c.json({ error: 'Internal server error' });
});

serve({ fetch: app.fetch, port: env.PORT }, () => {
    logger.info(`Backend on http://localhost:${env.PORT}`);
});

export default app;