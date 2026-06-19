import type Anthropic from '@anthropic-ai/sdk';
import { runAgent } from '../core.js';
import { systemPrompts } from '../prompts.js';
import type { AgentEvent } from '../core.js';

export function runBillingAgent(
    params: {
        messages: Anthropic.MessageParam[],
        conversationId: string,
        customerId?: string,
        useExtendedThinking: boolean
    }): AsyncGenerator<AgentEvent> {
    return runAgent({
        agentType: 'billing',
        systemPrompt: systemPrompts.billing,
        ...params,
        useExtendedThinking: params.useExtendedThinking ?? false
    })
}