import { describe, it, expect, vi } from 'vitest';

vi.mock('@sai/shared', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sai/shared')>()),
    // Fake db whose insert().values().returning() chain resolves to a stub row.
    getDb: () => ({
        insert: () => ({
            values: () => ({
                returning: () => Promise.resolve([{ id: 'appr_test_123' }]),
            }),
        }),
    }),
}));

import { checkRefundGuardrail, checkCancellationGuardrail, checkDiscountGuardrail } from '../guardrails.js';

const BASE_INPUT = { charge_id: 'ch_test', reason: 'requested_by_customer' as const, conversation_id: '00000000-0000-0000-0000-000000000001' };

describe('checkRefundGuardrail', () => {
    it('allows refunds under $100', async () => {
        const result = await checkRefundGuardrail({ ...BASE_INPUT, amount_cents: 9999 });
        expect(result.allowed).toBe(true);
    });

    it('allows refunds exactly at $100', async () => {
        const result = await checkRefundGuardrail({ ...BASE_INPUT, amount_cents: 10_000 });
        expect(result.allowed).toBe(true);
    });

    it('queues for approval at $100.01', async () => {
        const result = await checkRefundGuardrail({ ...BASE_INPUT, amount_cents: 10_001 });
        expect(result.allowed).toBe(false);
        if (!result.allowed) expect(result.action).toBe('queue_approval');
    });

    it('queues for approval at exactly $500', async () => {
        const result = await checkRefundGuardrail({ ...BASE_INPUT, amount_cents: 50_000 });
        expect(result.allowed).toBe(false);
        if (!result.allowed) expect(result.action).toBe('queue_approval');
    });

    it('escalates at $500.01', async () => {
        const result = await checkRefundGuardrail({ ...BASE_INPUT, amount_cents: 50_001 });
        expect(result.allowed).toBe(false);
        if (!result.allowed) expect(result.action).toBe('escalate');
    });

    it('blocks refunds outside 30-day window', async () => {
        const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
        const result = await checkRefundGuardrail({ ...BASE_INPUT, amount_cents: 5_000 }, { chargeDate: thirtyOneDaysAgo });
        expect(result.allowed).toBe(false);
        if (!result.allowed) expect(result.action).toBe('block');
    });

    it('allows refunds within 30-day window', async () => {
        const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
        const result = await checkRefundGuardrail({ ...BASE_INPUT, amount_cents: 5_000 }, { chargeDate: twentyNineDaysAgo });
        expect(result.allowed).toBe(true);
    });

    it('blocks zero-amount refunds', async () => {
        const result = await checkRefundGuardrail({ ...BASE_INPUT, amount_cents: 0 });
        expect(result.allowed).toBe(false);
        if (!result.allowed) expect(result.action).toBe('block');
    });
});

describe('checkCancellationGuardrail', () => {
    it('allows period-end cancellation', () => {
        const r = checkCancellationGuardrail({ subscription_id: 'sub_test', immediately: false });
        expect(r.allowed).toBe(true);
    });

    it('queues immediate cancellation for approval', () => {
        const r = checkCancellationGuardrail({ subscription_id: 'sub_test', immediately: true });
        expect(r.allowed).toBe(false);
        if (!r.allowed) expect(r.action).toBe('queue_approval');
    });
});

describe('checkDiscountGuardrail', () => {
    it('allows known coupon RETENTION20', () => {
        expect(checkDiscountGuardrail({ coupon_id: 'RETENTION20' }).allowed).toBe(true);
    });

    it('blocks unknown coupons', () => {
        const r = checkDiscountGuardrail({ coupon_id: 'HACKED50' });
        expect(r.allowed).toBe(false);
        if (!r.allowed) expect(r.action).toBe('block');
    });
});