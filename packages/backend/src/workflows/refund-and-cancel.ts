import { runWorkflow } from './engine.js';
import * as stripe from '../services/stripe.js';

type RefundAndCancelCtx = {
    customerId:      string
    subscriptionId:  string
    chargeId:        string
    amountCents:     number
    conversationId:  string
    refundId?:       string   // populated after step 1
    cancelledAt?:    string   // populated after step 2
}


export async function refundAndCancelWorkflow(
    params: Omit<RefundAndCancelCtx, 'refundId' | 'cancelledAt'>,
) {
    return runWorkflow<RefundAndCancelCtx>(
        {
            type: 'refund_and_cancel',
            steps: [
                {
                    name: 'issue_refund',
                    execute: async (ctx) => {
                        const refund = await stripe.issueRefund({
                            chargeId: ctx.chargeId, amountCents: ctx.amountCents,
                            reason: 'requested_by_customer', conversationId: ctx.conversationId,
                        });
                        return { refundId: refund.id };
                    },
                    compensate: async (ctx) => {
                        // Refunds cannot be reversed via API — log for manual review
                        console.error(`MANUAL REVIEW NEEDED: Refund ${ctx.refundId} issued but cancel failed. Customer ${ctx.customerId}.`);
                    },
                },
                {
                    name: 'cancel_subscription',
                    execute: async (ctx) => {
                        const sub = await stripe.cancelSubscription(ctx.subscriptionId, { immediately: false });
                        // Use Stripe's authoritative timestamp, not our local clock. For a
                        // period-end cancel, canceled_at = when Stripe recorded the cancellation
                        // request (set immediately); cancel_at = the future period-end date.
                        // canceled_at is the right audit value for "when was this cancelled".
                        // Fall back to now() only if Stripe somehow omits it.
                        const cancelledAt = sub.canceled_at
                            ? new Date(sub.canceled_at * 1000).toISOString()
                            : new Date().toISOString();
                        return { cancelledAt };
                    },
                },
            ],
        },
        params,
        params.conversationId,
    );
}