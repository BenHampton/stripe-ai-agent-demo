import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { env, getDb, pendingApprovals, conversations } from '@sai/shared';
import { eq, and, lt } from 'drizzle-orm';
import * as stripeService from '../services/stripe.js';

export const approvalsRouter = new Hono()

approvalsRouter.get('/', async (c) => {
    const db = getDb(env.DATABASE_URL)

    const id = c.req.param('id');
    if (!id) {
        return c.json({ error: 'Missing approval id' }, 400);
    }

    const rows = await db.select()
        .from(pendingApprovals)
        .where(eq(pendingApprovals.id, id))
        .limit(1)
    if (!rows[0]) {
        return c.json({ error: 'Not found'}, 404)
    }

    return c.json(rows[0])
})

approvalsRouter.post('/:id/review',
    zValidator('json', z.object({ decision: z.enum(['approved', 'rejected']), reviewedBy: z.string().min(1), note: z.string().optional() })),
    async (c) => {
        const db = getDb(env.DATABASE_URL);
        const { decision, reviewedBy, note } = c.req.valid('json');
        const rows = await db.select().from(pendingApprovals).where(eq(pendingApprovals.id, c.req.param('id'))).limit(1);
        const approval = rows[0];
        if (!approval)                          return c.json({ error: 'Not found' }, 404);
        if (approval.status !== 'pending')     return c.json({ error: `Already ${approval.status}` }, 409);
        if (approval.expiresAt < new Date()) { await db.update(pendingApprovals).set({ status: 'expired' }).where(eq(pendingApprovals.id, approval.id)); return c.json({ error: 'Expired' }, 410); }

        let executionResult: unknown = null;
        if (decision === 'approved') {
            try { executionResult = await executeApprovedAction(approval.action, approval.params as any); }
            catch (err) { return c.json({ error: 'Execution failed', detail: err instanceof Error ? err.message : 'Unknown' }, 500); }
        }

        await db.update(pendingApprovals).set({ status: decision, reviewedBy, reviewedAt: new Date(), reviewNote: note }).where(eq(pendingApprovals.id, approval.id));
        if (approval.conversationId) await db.update(conversations).set({ status: decision === 'approved' ? 'resolved' : 'escalated', resolvedAt: new Date() }).where(eq(conversations.id, approval.conversationId));

        return c.json({ success: true, decision, executionResult: decision === 'approved' ? executionResult : null });
    },
)

async function executeApprovedAction(action: string, params: Record<string, unknown>): Promise<unknown> {
    switch (action) {
        case 'issue_refund':
            return stripeService.issueRefund({ chargeId: params.charge_id as string, amountCents: params.amount_cents as number, reason: params.reason as any, conversationId: params.conversation_id as string });
        case 'cancel_subscription':
            return stripeService.cancelSubscription(params.subscription_id as string, { immediately: params.immediately as boolean });
        case 'apply_discount':
            return stripeService.applyDiscount(params.subscription_id as string, params.coupon_id as string, params.conversation_id as string);
        default:
            throw new Error(`Unknown action: ${action}`);
    }
}