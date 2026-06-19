import type Anthropic from '@anthropic-ai/sdk';
import { runAgent } from '../core.js';
import { systemPrompts } from '../prompts.js';
import type { AgentEvent } from '../core.js';

export function runRetentionAgent(params: { messages: Anthropic.MessageParam[]; conversationId: string; customerId?: string; useExtendedThinking?: boolean }): AsyncGenerator<AgentEvent> {
    return runAgent({ agentType: 'retention', systemPrompt: systemPrompts.retention, ...params, useExtendedThinking: params.useExtendedThinking ?? false });
}