import Stripe from 'stripe'
import { env } from '@sai/shared'

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-05-27.dahlia',
    typescript: true,
    // Telemetry is opt-out - disable to prevent SDK version data being sent to Stripe
    telemetry: false,
    // maxNetworkRetries: Stripe's built-in retry with exponential backoff.
    // Retries are safe because Stripe's SDK only retries on network errors
    // and 429/500/503 responses — never on 4xx user errors.
    maxNetworkRetries: 3
})

export function idempotencyKey(operation: string, entityId: string): string {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `${operation}-${entityId}-${date}`.slice(0, 255);
}

// Customer Operations
export async function getCustomer(customerId: string) {
    const customer = await stripe.customers.retrieve(customerId, {
        expand: ['subscriptions']
    })

    if (customer.deleted) {
        throw new Error(`Customer ${customerId} had been deleted`)
    }

    return customer
}

export async function listCustomerInvoices(
    customerId: string,
    limit = 10,
) {
    return stripe.invoices.list({
        customer: customerId,
        limit,
        expand: ['data.charge'],
    });
}

// Subscription Operations
export async function getSubscription(subscriptionId: string) {
    return stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['customer', 'items.data.price.product']
    })
}

export async function cancelSubscription(
    subscriptionId: string,
    options: { immediately?: boolean, cancellationReason?: string } = {},
) {
    if (options.immediately) {
        // Cancels immediately — customer loses access now
        return stripe.subscriptions.cancel(subscriptionId, {
            cancellation_details: options.cancellationReason
                ? { comment: options.cancellationReason }
                : {},
        });
    }

    // Cancels at period end — customer retains access until next billing date
    return stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
        cancellation_details: options.cancellationReason
            ? { comment: options.cancellationReason }
            : {},
    });
}

export async function reactivateSubscription(subscriptionId: string) {
    // Removes a scheduled cancellation - only works if not yet cancelled
    return stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false
    })
}

// Refund Operations
export interface IssueRefundParams {
    chargeId: string;
    amountCents: number;   // Stripe amounts are always in smallest currency unit (cents)
    reason: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    conversationId: string; // used to generate stable idempotency key
}

export async function issueRefund(params: IssueRefundParams) {
    return stripe.refunds.create(
        {
            charge: params.chargeId,
            amount: params.amountCents,
            reason: params.reason,
        },
        {
            // Idempotency key scoped to this conversation + charge.
            // If this refund is retried (network failure, approval re-execution),
            // Stripe returns the same refund object — not a second refund.
            idempotencyKey: idempotencyKey(`refund-${params.chargeId}`, params.conversationId),
        },
    );
}

// Discount / Retention Operations
export async function applyDiscount(
    subscriptionId: string,
    couponId: string,
    conversationId: string,
) {
    return stripe.subscriptions.update(
        subscriptionId,
        { discounts: [{ coupon: couponId }] },
        { idempotencyKey: idempotencyKey(`discount-${subscriptionId}-${couponId}`, conversationId) },
    );
}

// Webhook Signature Verification
export function constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
    secret: string,
): Stripe.Event {
    // Throws Stripe.errors.StripeSignatureVerificationError if invalid.
    // Never catch this silently — an invalid signature means either a bug
    // or someone attempting to forge events.
    return stripe.webhooks.constructEvent(payload, signature, secret);
}