import { Hono } from 'hono';
import { env } from '@sai/shared';
import { stripe } from '../services/stripe.js';
import { runProactiveRetentionScan } from '../agents/proactive-retention.js';

export const simulateRouter = new Hono();

/**
 * Trigger a test Stripe event.
 * Only available when STRIPE_SECRET_KEY starts with 'sk_test_' (test mode).
 * Uses Stripe's test helpers to create real events that go through your webhook.
 */
simulateRouter.post('/:event', async (c) => {
    if (!env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
        return c.json({ error: 'Simulation only available in Stripe test mode' }, 403);
    }

    const { event } = c.req.param();
    type SimBody = { customerId?: string; subscriptionId?: string };
    // Annotate the fallback as SimBody too, otherwise the catch returns a bare {}
    // and TS widens body to `SimBody | {}` — then body.customerId fails on the {} branch.
    const body = await c.req.json<SimBody>().catch((): SimBody => ({}));

    try {
        switch (event) {
            case 'payment_failed': {
                if (!body.customerId) return c.json({ error: 'customerId required' }, 400);
                // Create a PaymentIntent and immediately fail it
                const pi = await stripe.paymentIntents.create({
                    amount:   7900,
                    currency: 'usd',
                    customer: body.customerId,
                    payment_method: 'pm_card_chargeDeclined', // test card that always declines
                    confirm:  true,
                    return_url: 'http://localhost:5173',
                }).catch(e => {
                    // Payment failure is expected — Stripe still fires the webhook
                    return { id: e.payment_intent?.id, customer: body.customerId };
                });
                return c.json({ triggered: 'payment_intent.payment_failed', paymentIntentId: (pi as any).id });
            }

            case 'subscription_cancelled': {
                if (!body.customerId) return c.json({ error: 'customerId required' }, 400);
                // Look up the customer's active subscription — the UI doesn't know the sub ID
                const subs = await stripe.subscriptions.list({ customer: body.customerId, limit: 1 });
                const sub = subs.data[0];
                if (!sub) return c.json({ error: 'No active subscription found for customer' }, 404);
                await stripe.subscriptions.cancel(sub.id);
                return c.json({ triggered: 'customer.subscription.deleted', subscriptionId: sub.id });
            }

            case 'dispute_created': {
                if (!body.customerId) return c.json({ error: 'customerId required' }, 400);
                // Create a charge with a test card that auto-disputes, then charge it
                const charge = await stripe.charges.create({
                    amount:   5000,
                    currency: 'usd',
                    customer: body.customerId,
                    source:   'tok_createDispute', // test token that creates a dispute,
                }).catch(e => ({ id: 'ch_test', customer: body.customerId }));
                return c.json({ triggered: 'charge.dispute.created', chargeId: (charge as any).id });
            }

            case 'retention_scan': {
                // Call the scan function directly — no self-fetch (would break in production)
                const data = await runProactiveRetentionScan();
                return c.json({ triggered: 'proactive_retention_scan', ...data });
            }

            default:
                return c.json({ error: `Unknown event: ${event}` }, 400);
        }
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Simulation failed' }, 500);
    }
});