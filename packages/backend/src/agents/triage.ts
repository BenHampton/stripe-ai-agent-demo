import Anthropic from '@anthropic-ai/sdk';
import { env } from '@sai/shared';
import { logger } from '../lib/logger.js';
import { z } from 'zod';
import type { AgentType } from '../tools/registry.js';

export interface TriageResult {
    category: AgentType
    confidence: number
    reason: string
}

// The classification schema, shared between the tool definition (what we ask the
// model to produce) and Zod validation (what we verify at runtime). Forcing a tool
// call means the model MUST return arguments matching this shape — it cannot reply
// with prose or malformed JSON, which is the failure mode that plain JSON.parse hits.
const CATEGORIES = ['billing', 'knowledge', 'retention', 'general'] as const;

const ClassificationSchema = z.object({
    category: z.enum(CATEGORIES),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
});

// Below this confidence we don't trust the routing and fall back to the general agent
// — but as a DELIBERATE, logged decision, not a silent catch. Structured output
// guarantees the SHAPE; we still own the POLICY for low-confidence cases.
const CONFIDENCE_FLOOR = 0.4;

export async function triageMessage(
    userMessage: string,
    history: Anthropic.MessageParam[] = [],
): Promise<TriageResult> {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        tools: [{
            name: 'classify',
            description: 'Classify the customer message into exactly one routing category.',
            input_schema: {
                type: 'object',
                properties: {
                    category:   { type: 'string', enum: CATEGORIES, description: 'The routing category that best fits the request.' },
                    confidence: { type: 'number', description: 'Your confidence from 0.0 to 1.0.' },
                    reason:     { type: 'string', description: 'One brief sentence justifying the choice.' },
                },
                required: ['category', 'confidence', 'reason'],
            },
        }],
        // Force the model to call classify — it cannot return free-form text.
        tool_choice: { type: 'tool', name: 'classify' },
        messages: [...history.slice(-4), { role: 'user', content: userMessage }],
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {

        logger.warn('triage returned no tool call - defaulting to general');
        return {
            category: 'general',
            confidence: 0,
            reason: 'no classification returned'
        }
    }

    // Defense in depth: the tool schema constrains the model, but we still validate the
    // input at runtime. toolUse.input is typed as unknown - Zod turns it into a trusted shape.
    const parsed = ClassificationSchema.safeParse(toolUse.input);
    if (!parsed.success) {

        logger.warn({ input: toolUse.input }, 'triage classification failed schema validation - defaulting to general')
        return {
            category: 'general',
            confidence: 0,
            reason: 'classification failed validation'
        }
    }

    const result = parsed.data;
    if (result.confidence < CONFIDENCE_FLOOR) {

        logger.info({ category: result.category, confidence: result.confidence }, 'triage confidence below floor - routing to general');
        return {
            category: 'general',
            confidence: result.confidence,
            reason: `low confidence: ${result.reason}`
        };
    }

    return result;
}

export function shouldUseExtendedThinking(category: AgentType, userMessage: string): boolean {
    if (!env.ENABLE_EXTENDED_THINKING) {
        return false
    }

    if (!['billing', 'retention'].includes(category)) {
        return false
    }

    const keywords = ['refund', 'cancel', 'charge', 'dispute', 'money', 'billing', 'payment'];

    return keywords.some(kw => userMessage.toLowerCase().includes(kw))
}