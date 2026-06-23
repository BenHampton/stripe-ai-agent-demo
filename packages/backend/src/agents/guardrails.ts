import { env, getDb, pendingApprovals } from '@sai/shared';
import { agentLogger } from '../lib/logger.js';
import type { AgentType } from '../tools/registry.js';

// Thresholds Must match knowledge-base/refund-policy.md
// These constants are what the code ENFORCES; refund-policy.md is what the agent
// TELLS customers. They must always agree, or the agent will be confidently wrong.
//
// Change a threshold here → update refund-policy.md to match, then `pnpm ingest`.
// Change refund-policy.md → update these constants to match, then redeploy.
const REFUND_AUTO_APPROVE_CENTS    = 10_000;  // $100
const REFUND_MANAGER_CEILING_CENTS = 50_000;  // $500
const REFUND_WINDOW_DAYS           = 30;
const APPROVAL_EXPIRY_HOURS        = 24;

export type GuardrailResult =
    | { allowed: true }
    | { allowed: false; reason: string; action: 'block' | 'escalate' | 'queue_approval' };

export interface ApprovalQueueEntry {
    conversationId: string;
    agentType:      AgentType;
    action:         string;
    params:         Record<string, unknown>;
    reasoning:      string;
}

export async function checkRefundGuardrail(
    input: { charge_id: string; amount_cents: number; reason: string; conversation_id: string },
    context: { chargeDate?: Date; agentReasoning?: string } = {},
): Promise<GuardrailResult> {
    if (input.amount_cents <= 0)
        return { allowed: false, reason: 'Refund amount must be positive', action: 'block' };

    if (context.chargeDate) {
        const ageDays = (Date.now() - context.chargeDate.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > REFUND_WINDOW_DAYS)
            return { allowed: false, reason: `Charge is ${Math.floor(ageDays)} days old, outside the ${REFUND_WINDOW_DAYS}-day refund window`, action: 'block' };
    }

    if (input.amount_cents <= REFUND_AUTO_APPROVE_CENTS) return { allowed: true };

    if (input.amount_cents <= REFUND_MANAGER_CEILING_CENTS)
        return { allowed: false, reason: `Refund of $${(input.amount_cents / 100).toFixed(2)} requires manager approval`, action: 'queue_approval' };

    return { allowed: false, reason: `Refund of $${(input.amount_cents / 100).toFixed(2)} requires senior finance review`, action: 'escalate' };
}

export function checkCancellationGuardrail(input: { subscription_id: string; immediately: boolean }): GuardrailResult {
    if (input.immediately)
        return { allowed: false, reason: 'Immediate cancellation requires human approval', action: 'queue_approval' };
    return { allowed: true };
}

export function checkDiscountGuardrail(input: { coupon_id: string }): GuardrailResult {
    const ALLOWED_COUPONS = ['RETENTION20'];
    if (!ALLOWED_COUPONS.includes(input.coupon_id))
        return { allowed: false, reason: `Coupon "${input.coupon_id}" is not in the approved coupon list`, action: 'block' };
    return { allowed: true };
}

export async function createApprovalEntry(entry: ApprovalQueueEntry): Promise<string> {
    const db = getDb(env.DATABASE_URL);
    const expiresAt = new Date(Date.now() + APPROVAL_EXPIRY_HOURS * 60 * 60 * 1000);
    const result = await db.insert(pendingApprovals).values({ ...entry, expiresAt }).returning();
    const id = result[0]?.id;
    if (!id) throw new Error('Failed to create approval entry');
    return id;
}

export async function runGuardrail(
    toolName:       string,
    toolInput:      Record<string, unknown>,
    agentType:      AgentType,
    conversationId: string,
    agentReasoning?: string,
): Promise<{ result: GuardrailResult; approvalId?: string }> {
    let guardrailResult: GuardrailResult;

    switch (toolName) {
        case 'issue_refund':
            guardrailResult = await checkRefundGuardrail(toolInput as any, agentReasoning ? { agentReasoning } : {}); break;
        case 'cancel_subscription':
            guardrailResult = checkCancellationGuardrail(toolInput as any); break;
        case 'apply_discount':
            guardrailResult = checkDiscountGuardrail(toolInput as any); break;
        default:
            return { result: { allowed: true } };
    }

    // Audit trail for the money-safety boundary. A blocked or queued money action is
    // security-relevant — log it at warn so it's easy to find. (Allowed actions are
    // already visible via the tool-success logs in core.ts, so we don't double-log them.)
    const log = agentLogger(conversationId, agentType);
    if (!guardrailResult.allowed) {
        log.warn(
            { tool: toolName, action: guardrailResult.action, reason: guardrailResult.reason },
            'guardrail blocked a money action',
        );
    }

    if (!guardrailResult.allowed && guardrailResult.action === 'queue_approval') {
        const approvalId = await createApprovalEntry({ conversationId, agentType, action: toolName, params: toolInput, reasoning: agentReasoning ?? 'No reasoning provided' });

        log.info({ tool: toolName, approvalId }, 'approval queued for human review');
        return {
            result: guardrailResult,
            approvalId
        };
    }

    return { result: guardrailResult };
}

/**
 * Compute a structured confidence score from observable signals.
 * Does NOT parse freeform text — uses measurable agent behavior instead.
 */
export function computeConfidence(signals: {
    ragScores: number[],
    toolCallCount: number,
    toolErrorCount: number,
    escalated: boolean,
    approvalQueued: boolean,
}): number {
    let score = 1.0;

    if (signals.ragScores.length > 0) {
        const avg = signals.ragScores.reduce((a, b) => a + b, 0) / signals.ragScores.length;
        score -= (1 - avg) * 0.3;
    }

    if (signals.toolCallCount > 0) {
        score -= (signals.toolErrorCount / signals.toolCallCount) * 0.4
    }

    if (signals.escalated)      {
        score -= 0.2
    }

    if (signals.approvalQueued) {
        score -= 0.1
    }

    return Math.max(0, Math.min(1, score));
}