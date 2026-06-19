import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { env, getDb, conversations, messages, agentTraces } from '@sai/shared';
import { stripe } from '../services/stripe.js';
import { orchestrate } from './orchestrator.js';

export interface AtRiskCustomer {
    customerId:      string;
    subscriptionId:  string;
    riskReason:      'cancel_at_period_end' | 'payment_failed' | 'trial_ending';
    cancelDate?:     string;
    planName?:       string;
}

/**
 * Scan Stripe for customers who are at risk of churning.
 * Returns customers who meet any at-risk criteria.
 */
export async function scanAtRiskCustomers(): Promise<AtRiskCustomer[]> {
    const atRisk: AtRiskCustomer[] = [];

    // Customers with scheduled cancellations
    const cancellingSubscriptions = await stripe.subscriptions.list({
        status: 'active',
        expand: ['data.customer', 'data.items.data.price.product'],
        limit: 100,
    });

    for (const sub of cancellingSubscriptions.data) {
        if (sub.cancel_at_period_end) {

            // Extract once. Both cancelDate and planName are optional on AtRiskCustomer,
            // so under exactOptionalPropertyTypes we spread them in only when present
            // rather than assigning undefined.
            const planName = (sub.items.data[0]?.price?.product as Stripe.Product | undefined)?.name;
            atRisk.push({
                customerId:     sub.customer as string,
                subscriptionId: sub.id,
                riskReason:     'cancel_at_period_end',
                ...(sub.cancel_at ? { cancelDate: new Date(sub.cancel_at * 1000).toISOString() } : {}),
                ...(planName ? { planName } : {}),
            });
        }
    }

    // Customers with recent payment failures (past-due subscriptions)
    const pastDue = await stripe.subscriptions.list({ status: 'past_due', limit: 100 });
    for (const sub of pastDue.data) {
        atRisk.push({
            customerId:     sub.customer as string,
            subscriptionId: sub.id,
            riskReason:     'payment_failed',
        });
    }

    return atRisk;
}

/**
 * Run the retention agent for a single at-risk customer.
 * Creates a conversation record and runs the orchestrator with a
 * structured prompt describing the risk scenario.
 */
export async function runRetentionAssessment(customer: AtRiskCustomer): Promise<string> {
    const db = getDb(env.DATABASE_URL);

    const prompt = customer.riskReason === 'cancel_at_period_end'
        ? `[PROACTIVE RETENTION SCAN] Customer ${customer.customerId} has scheduled their subscription to cancel.
Subscription: ${customer.subscriptionId} | Plan: ${customer.planName ?? 'Unknown'} | Cancels: ${customer.cancelDate ?? 'at period end'}

Please:
1. Look up this customer's account and subscription history
2. Research our retention offers and eligibility criteria in the knowledge base
3. Assess whether they are eligible for a retention discount
4. Generate a recommended action: (a) offer RETENTION20 discount, (b) schedule follow-up call, or (c) accept cancellation gracefully
5. Summarize your recommendation with reasoning — a human will review before any action is taken`
        : `[PROACTIVE RETENTION SCAN] Customer ${customer.customerId} has a past-due subscription (payment failure).
Subscription: ${customer.subscriptionId}

Please:
1. Look up this customer's account and payment history
2. Review our payment failure recovery policy in the knowledge base
3. Assess the dunning stage and likelihood of recovery
4. Generate a recommended action: (a) send payment reminder context, (b) offer temporary grace period, or (c) prepare for involuntary churn
5. Summarize your recommendation — a human will review before any outreach`;

    const convResult = await db.insert(conversations).values({
        customerId: customer.customerId,
        channel:    'proactive',
        status:     'active',
        agentType:  'retention',
        metadata:   { riskReason: customer.riskReason, subscriptionId: customer.subscriptionId },
    }).returning();

    const conversationId = convResult[0]!.id;

    await db.insert(messages).values({ conversationId, role: 'user', content: prompt });

    let fullResponse = ''; let lastTrace: any;
    for await (const event of orchestrate({ userMessage: prompt, conversationId, customerId: customer.customerId, history: [] })) {
        if (event.type === 'token') fullResponse += event.content;
        if (event.type === 'done')  lastTrace = event.trace;
    }

    if (fullResponse) await db.insert(messages).values({ conversationId, role: 'assistant', content: fullResponse });
    if (lastTrace)    await db.insert(agentTraces).values({ conversationId, agentType: 'retention', ...lastTrace });

    // Mark for human review. NOTE: in this demo 'pending_review' is a terminal
    // display state — the conversation shows as "Pending Review" in the UI, but
    // there's no review queue or resolve action yet (unlike pending_approval, which
    // has the approval queue). Wiring a full review queue (list + resolve path +
    // dashboard metric) is a "Beyond the Demo" item.
    await db.update(conversations).set({ status: 'pending_review' }).where(eq(conversations.id, conversationId));

    return conversationId;
}

/**
 * Main entry point — called by the /api/retention/scan endpoint or a cron job.
 * Returns a summary of customers scanned and conversations created.
 */
export async function runProactiveRetentionScan(): Promise<{
    scanned:   number;
    processed: number;
    conversations: string[];
}> {
    const atRisk = await scanAtRiskCustomers();
    const created: string[] = [];

    console.log(`[Retention Scan] Found ${atRisk.length} at-risk customers`);

    for (const customer of atRisk) {
        try {
            const convId = await runRetentionAssessment(customer);
            created.push(convId);
            console.log(`  ✓ ${customer.customerId} (${customer.riskReason}) → conversation ${convId}`);
        } catch (err) {
            console.error(`  ✗ Failed for ${customer.customerId}:`, err);
        }
    }

    return { scanned: atRisk.length, processed: created.length, conversations: created };
}