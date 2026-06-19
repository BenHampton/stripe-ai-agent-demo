import type Anthropic from '@anthropic-ai/sdk';
import { triageMessage, shouldUseExtendedThinking } from './triage.js';
import { runBillingAgent }   from './specialists/billing.js';
import { runKnowledgeAgent } from './specialists/knowledge.js';
import { runRetentionAgent } from './specialists/retention.js';
import { runAgent }          from './core.js';
import { systemPrompts }     from './prompts.js';
import type { AgentEvent }  from './core.js';

export interface  OrchestratorParms {
    userMessage: string
    conversationId: string
    customerId: string
    history: Anthropic.MessageParam[]
}

export async function* orchestrate(params: OrchestratorParms): AsyncGenerator<AgentEvent | { type: 'triage', category: string, confidence: number}> {
    const triage = await triageMessage(params.userMessage, params.history)

    yield {
        type: 'triage',
        category: triage.category,
        confidence: triage.confidence
    }

    const messages: Anthropic.MessageParam[] = [...params.history, { role: 'user', content: params.userMessage }]
    const useExtendedThinking = shouldUseExtendedThinking(triage.category, params.userMessage)
    const base = {
        messages,
        conversationId: params.conversationId,
        customerId: params.customerId,

    }

    switch (triage.category) {
        case 'billing': yield* runBillingAgent({ ...base, useExtendedThinking })
            break
        case 'retention': yield* runRetentionAgent({ ...base, useExtendedThinking })
            break
        case 'knowledge': yield* runKnowledgeAgent(base)
            break
        default:
            yield* runAgent({
                agentType: 'general',
                systemPrompt: systemPrompts.general,
                ...base
            })
    }
}