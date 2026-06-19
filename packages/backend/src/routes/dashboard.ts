import { Hono } from 'hono';
import { sql, eq, gte, and } from 'drizzle-orm';
import { env, getDb, conversations, agentTraces, pendingApprovals } from '@sai/shared';

export const dashboardRouter = new Hono();

dashboardRouter.get('/metrics', async (c) => {
    const db      = getDb(env.DATABASE_URL);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel
    const [convStats, traceStats, approvalStats, dailyCosts, agentBreakdown] = await Promise.all([

        // Conversation counts by status (7 days)
        db.execute(sql`
      SELECT status, COUNT(*) as count, channel
      FROM conversations
      WHERE created_at >= ${since7d}
      GROUP BY status, channel
      ORDER BY count DESC
    `),

        // Agent performance aggregate (7 days)
        db.execute(sql`
      SELECT
        AVG(confidence)::float             AS avg_confidence,
        SUM(cost_usd_cents)                AS total_cost_cents,
        AVG(duration_ms)::int              AS avg_duration_ms,
        AVG(input_tokens + output_tokens)::int AS avg_tokens,
        COUNT(*)                           AS total_runs,
        SUM(CASE WHEN outcome = 'resolved' THEN 1 ELSE 0 END)::int AS resolved,
        SUM(CASE WHEN outcome = 'escalated' THEN 1 ELSE 0 END)::int AS escalated,
        SUM(CASE WHEN outcome = 'pending_approval' THEN 1 ELSE 0 END)::int AS pending_approval
      FROM agent_traces
      WHERE created_at >= ${since7d}
    `),

        // Pending approvals count
        db.execute(sql`
      SELECT COUNT(*) as count FROM pending_approvals WHERE status = 'pending'
    `),

        // Daily cost breakdown (7 days)
        db.execute(sql`
      SELECT
        DATE(created_at) AS date,
        SUM(cost_usd_cents) AS cost_cents,
        COUNT(*) AS runs
      FROM agent_traces
      WHERE created_at >= ${since7d}
      GROUP BY DATE(created_at)
      ORDER BY date
    `),

        // Breakdown by agent type
        db.execute(sql`
      SELECT
        agent_type,
        COUNT(*) AS runs,
        AVG(confidence)::float AS avg_confidence,
        SUM(cost_usd_cents) AS cost_cents,
        AVG(duration_ms)::int AS avg_duration_ms
      FROM agent_traces
      WHERE created_at >= ${since7d}
      GROUP BY agent_type
      ORDER BY runs DESC
    `),
    ]);

    return c.json({
        period:           '7d',
        conversations:    convStats.rows,
        performance:      traceStats.rows[0] ?? {},
        pendingApprovals: Number(approvalStats.rows[0]?.count ?? 0),
        dailyCosts:       dailyCosts.rows,
        agentBreakdown:   agentBreakdown.rows,
    });
});

// Conversation detail with full trace
dashboardRouter.get('/conversations', async (c) => {
    const db     = getDb(env.DATABASE_URL);
    const limit  = Math.min(50, parseInt(c.req.query('limit') ?? '20'));
    const offset = parseInt(c.req.query('offset') ?? '0');

    const rows = await db.execute(sql`
    SELECT
      c.id, c.customer_id, c.channel, c.status, c.agent_type,
      c.created_at, c.resolved_at,
      t.confidence, t.cost_usd_cents, t.duration_ms, t.outcome,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
    FROM conversations c
    LEFT JOIN agent_traces t ON t.conversation_id = c.id
    ORDER BY c.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

    return c.json({ conversations: rows.rows, limit, offset });
});