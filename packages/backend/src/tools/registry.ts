import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { stripeTools } from './stripe-tools.js';
import { ragTool }    from './rag-tool.js';
import { thinkTool }  from './think-tool.js';

export type AgentType = 'billing' | 'knowledge' | 'retention' | 'general';

export interface RegisteredTool<T = unknown> {
    definition: Anthropic.Tool
    schema: z.ZodType<T>
    handler: (input: T) => Promise<unknown>
}


export const toolRegistry: Record<string, RegisteredTool<any>> = {
    ...stripeTools,
    search_knowledge_base: ragTool,
    think: thinkTool
}

const toolScopes: Record<AgentType, string[]> = {
    billing:   ['think', 'get_customer', 'get_subscription', 'list_invoices', 'issue_refund', 'cancel_subscription', 'reactivate_subscription', 'search_knowledge_base'],
    knowledge: ['think', 'search_knowledge_base', 'get_customer', 'get_subscription'],
    retention: ['think', 'get_customer', 'get_subscription', 'cancel_subscription', 'reactivate_subscription', 'apply_discount', 'search_knowledge_base'],
    general:   ['think', 'search_knowledge_base', 'get_customer', 'get_subscription'],
};

export function getToolsForAgent(agentType: AgentType): {
    definitions: Anthropic.Tool[]
    handlers: Record<string, RegisteredTool<any>>
} {
    const names = toolScopes[agentType]
    const handlers: Record<string, RegisteredTool<any>> = {}
    const definitions: Anthropic.Tool[] = []
    for (const name of names) {
        const tool = toolRegistry[name]
        if (tool) {
            handlers[name] = tool
            definitions.push(tool.definition)
        }
    }

    return { definitions, handlers }
}
