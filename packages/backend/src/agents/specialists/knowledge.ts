import type Anthropic from '@anthropic-ai/sdk';
import { runAgent } from '../core.js';
import { systemPrompts } from '../prompts.js';
import type { AgentEvent } from '../core.js';

export function runKnowledgeAgent(params: { messages: Anthropic.MessageParam[]; conversationId: string; customerId?: string }): AsyncGenerator<AgentEvent> {
    return runAgent({ agentType: 'knowledge', systemPrompt: systemPrompts.knowledge, ...params, useExtendedThinking: false });
}