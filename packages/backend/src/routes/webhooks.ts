import { Hono } from 'hono';
import { env, getDb, conversations, messages, agentTraces } from '@sai/shared';
import { eq } from 'drizzle-orm';
import { constructWebhookEvent } from '../services/stripe.js';
import { orchestrate } from '../agents/orchestrator.js';
import type { AgentTrace } from '../agents/core.js';

export const webhooksRouter = new Hono()

function buildAgentMessageFromEvent(event: any): { message: string, customerId: string } | null {

    switch (event.type) {
        case 'payment_intent.payment_failed': {
            const pi = event.data.object
            return {
                customerId: pi.customerId,
                message: `[AUTOMATED] Payment failed.
                Event: payment_intent.payment_failed | PI: ${pi.id} | Amount: $${(pi.amount/100).toFixed(2)}
                Failure: ${pi.last_payment_error?.message ?? 'Unknown'} | Customer: ${pi.customer}
                Look up this customer, understand their subscription status, and determine appropriate action.
                Is this their first failure? What is the dunning status? Draft a recovery plan and log it.`
            }
        }
        case 'customer.subscription.deleted': {
            const sub = event.data.object;
            return {
                customerId: sub.customer,
                message: `[AUTOMATED] Subscription cancelled.
                Event: customer.subscription.deleted | Sub: ${sub.id} | Customer: ${sub.customer}
                Plan: ${sub.items?.data?.[0]?.price?.nickname ?? 'Unknown'} | Reason: ${sub.cancellation_details?.comment ?? 'Not provided'}
                Review this cancellation. Is this customer eligible for a win-back? Log a retention assessment.` };
        }
        case 'charge.dispute.created': {
            const d = event.data.object;
            return {
                customerId: d.customer,
                message: `[AUTOMATED] Dispute filed.
                Event: charge.dispute.created | Dispute: ${d.id} | Amount: $${(d.amount/100).toFixed(2)} | Reason: ${d.reason}
                Evidence due: ${new Date(d.evidence_due_by * 1000).toISOString()}
                IMPORTANT: Do NOT process refunds for disputed charges. Escalate immediately — note the ID, amount, and due date.` };
        }
        default: return null;
    }
}

webhooksRouter.post('/', async (c) => {
    const rawBody = await c.req.text()
    const sig = c.req.header('stripe-signature')
    if (!sig) {
        return c.json({ error: 'Missing stripe-signature header' }, 400)
    }

    let event: ReturnType<typeof constructWebhookEvent>

    try {
        event = constructWebhookEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET)
    } catch (err) {
        console.error('Webhook sig failed:', err)
        return c.json({ error: 'Invalid signature' })
    }

    const db = getDb(env.DATABASE_URL)

    // Idempotency, skip if already processed
    const existing = await db.select({ id: conversations.id})
        .from(conversations)
        .where(eq(conversations.stripeEventId, event.id))
        .limit(1)
    if (existing.length > 0) {
        return c.json({ received: true, status: 'already_processed'})
    }

    const agentInput = buildAgentMessageFromEvent(event)
    if (!agentInput || !agentInput.customerId) {
        return c.json({ received: true, status: 'ignored_no_customer' })

    }

    const convResult = await db.insert(conversations)
        .values({
            customerId: agentInput.customerId,
            channel: 'webhook',
            status: 'active',
            stripeEventId: event.id,
            metadata: { eventType: event.type }
        })
        .returning()
    const conversationId = convResult[0]?.id
    if (!conversationId) {
        return c.json({ error: 'Failed to create conversation' }, 500)
    }

    await db.insert(messages)
        .values({
            conversationId,
            role: 'user',
            content: agentInput.message
        })

    // Return 200 immediately, process agent to avoid String timeout

    setImmediate(() => processWebhookAsync(conversationId, agentInput, db).catch(console.error))
    return c.json({ received: true, conversationId })
})

async function processWebhookAsync(conversationId: string, agentInput: { message: string; customerId: string }, db: ReturnType<typeof getDb>) {
    let lastTrace: AgentTrace | undefined; let fullResponse = '';

    for await (const event of orchestrate({ userMessage: agentInput.message, conversationId, customerId: agentInput.customerId, history: [] })) {
        if (event.type === 'token') {
            fullResponse += event.content;
        }
        if (event.type === 'done') {
            lastTrace = event.trace;
        }
    }
    if (fullResponse){
        await db.insert(messages)
            .values({
                conversationId,
                role: 'assistant',
                content: fullResponse });
    }
    if (lastTrace) {
        await db.insert(agentTraces)
            .values({ conversationId, agentType: 'billing', ...lastTrace });
        await db.update(conversations)
            .set({
                status: lastTrace.outcome === 'pending_approval' ? 'pending_approval' : 'resolved',
                agentType: 'billing',
                resolvedAt: lastTrace.outcome !== 'pending_approval' ? new Date() : undefined })
            .where(eq(conversations.id, conversationId));
    }
}

