import { z } from 'zod';
import type { RegisteredTool } from './registry.js';
import * as stripe from '../services/stripe.js';

export const stripeTools: Record<string, RegisteredTool<any>> = {

    get_customer: {
        definition: {
            name: 'get_customer',
            description: `Retrieve a Stripe customer by their customer ID (cus_...).
            Returns name, email, default payment method status, and their subscriptions.
            Use this as the first tool call in almost every conversation.`,
            input_schema: {
                type: 'object',
                properties: {
                    customer_id: {
                        type: 'string',
                        description: 'Stripe customer ID (cus_..)'
                    }
                },
                required: ['customer_id']
            },
        },
        schema: z.object({ customer_id: z.string().startsWith('cuz_') }),
        handler: async ({ customer_id }) => stripe.getCustomer(customer_id)
    },

    get_subscription: {
        definition: {
            name: 'get_subscription',
            description: `Retrieve a specific subscription by ID (sub_...).
            Returns status, plan details, current period start/end, cancel_at_period_end flag.
            Use when you need billing period dates for proration or cancellation checks.`,
            input_schema: { type: 'object', properties: { subscription_id: { type: 'string' } }, required: ['subscription_id'] },
        },
        schema: z.object({ subscription_id: z.string().startsWith('sub_') }),
        handler: async ({ subscription_id }) => stripe.getSubscription(subscription_id),
    },

    list_invoices: {
        definition: {
            name: 'list_invoices',
            description: `List recent invoices for a customer.
            Returns invoice ID, amount, status (paid/open/void), charge ID, and date.
            The charge ID from a paid invoice is required to issue a refund.`,
            input_schema: { type: 'object', properties: { customer_id: { type: 'string' }, limit: { type: 'number', description: 'Max 10, default 5' } }, required: ['customer_id'] },
        },
        schema: z.object({ customer_id: z.string(), limit: z.number().int().min(1).max(10).default(5) }),
        handler: async ({ customer_id, limit }) => stripe.listCustomerInvoices(customer_id, limit),
    },

    issue_refund: {
        definition: {
            name: 'issue_refund',
            description: `Issue a refund for a specific charge. IMPORTANT: amounts are in cents ($50 = 5000).
            Before calling, use think() to verify eligibility against refund policy.
            Refunds under $10000 cents ($100): process immediately.
            Refunds $10000-$50000 cents ($100-$500): require manager approval — do NOT call this, queue instead.
            Refunds over $50000 cents ($500): escalate to senior finance — do NOT call this.`,
            input_schema: { type: 'object', properties: { charge_id: { type: 'string' }, amount_cents: { type: 'number' }, reason: { type: 'string', enum: ['duplicate', 'fraudulent', 'requested_by_customer'] }, conversation_id: { type: 'string' } }, required: ['charge_id', 'amount_cents', 'reason', 'conversation_id'] },
        },
        schema: z.object({ charge_id: z.string().startsWith('ch_'), amount_cents: z.number().int().positive(), reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']), conversation_id: z.uuid() }),
        handler: async ({ charge_id, amount_cents, reason, conversation_id }) =>
            stripe.issueRefund({ chargeId: charge_id, amountCents: amount_cents, reason, conversationId: conversation_id }),
    },

    cancel_subscription: {
        definition: {
            name: 'cancel_subscription',
            description: `Cancel a customer subscription.
            immediately=false (default): cancel at period end — customer retains access until billing date.
            immediately=true: cancel now — customer loses access immediately. Use only when explicitly requested.`,
            input_schema: { type: 'object', properties: { subscription_id: { type: 'string' }, immediately: { type: 'boolean' }, cancellation_reason: { type: 'string' } }, required: ['subscription_id'] },
        },
        schema: z.object({ subscription_id: z.string().startsWith('sub_'), immediately: z.boolean().default(false), cancellation_reason: z.string().optional() }),
        handler: async ({ subscription_id, immediately, cancellation_reason }) =>
            stripe.cancelSubscription(subscription_id, { immediately, cancellationReason: cancellation_reason }),
    },

    reactivate_subscription: {
        definition: {
            name: 'reactivate_subscription',
            description: `Remove a scheduled cancellation (cancel_at_period_end=true). Use when customer changes mind.
            Will fail if subscription is already fully cancelled.`,
            input_schema: { type: 'object', properties: { subscription_id: { type: 'string' } }, required: ['subscription_id'] },
        },
        schema: z.object({ subscription_id: z.string().startsWith('sub_') }),
        handler: async ({ subscription_id }) => stripe.reactivateSubscription(subscription_id),
    },

    apply_discount: {
        definition: {
            name: 'apply_discount',
            description: `Apply a discount coupon to a subscription.
            Available: RETENTION20 (20% off for 3 months).
            Only offer to customers subscribed 1+ month with no discount in last 12 months.
            Always call think() first to verify eligibility.`,
            input_schema: { type: 'object', properties: { subscription_id: { type: 'string' }, coupon_id: { type: 'string' }, conversation_id: { type: 'string' } }, required: ['subscription_id', 'coupon_id', 'conversation_id'] },
        },
        schema: z.object({ subscription_id: z.string().startsWith('sub_'), coupon_id: z.string().min(1), conversation_id: z.string().uuid() }),
        handler: async ({ subscription_id, coupon_id, conversation_id }) =>
            stripe.applyDiscount(subscription_id, coupon_id, conversation_id),
    },

}