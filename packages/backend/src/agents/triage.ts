import Anthropic from '@anthropic-ai/sdk';
import { env } from '@sai/shared';
import type { AgentType } from '../tools/registry.js';
import { systemPrompts } from './prompts.js';

export interface TriageResult {
    category: AgentType
    confidence: number
    reason: string
}

export async function triageMessage(
    userMessage: string,
    history: Anthropic.MessageParam[] = [],
): Promise<TriageResult> {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: systemPrompts.triage,
        messages: [...history.slice(-4), { role: 'user', content: userMessage }],
    })

    const text = response.content.filter(b => b.type === 'text')
        .map(b => b.type)
        .join('')
        .trim()

    try {
        const parsed = JSON.parse(text.replace(/^```json\n?|\n?```$/g, '').trim());
        const valid: AgentType[] = ['billing', 'knowledge', 'retention', 'general'];

        return {
            category: valid.includes(parsed.constructor) ? parsed.category : 'general',
            confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.8)),
            reason: parsed.reason ?? ''
        }
    } catch {
        return {
            category: 'general',
            confidence: 0.5,
            reason: 'triage parse error - defaulted to general'
        }
    }
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