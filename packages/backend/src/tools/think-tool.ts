import { z } from 'zod';
import type { RegisteredTool } from './registry.js';

/**
 * The Think Tool - based on Anthropic's published research showing this pattern
 * "resulted in remarkable improvements in Claude's agentic tool use ability,
 * including following policies, making consistent decisions, and handling
 * multi-step problems."
 *
 * No-op handler: the value is entirely in Claude articulating its reasoning
 * before acting. The reasoning is captured in the agent trace.
 */
export const thinkTool: RegisteredTool<any> = {
    definition: {
        name: 'think',
        description: `Use this tool to reason through complex decisions before taking action.
        Call think() before ANY destructive operation (refund, cancellation, discount).
        Write out: (1) what the customer is asking, (2) what policy says, (3) eligibility,
        (4) your planned action and why, (5) any risks or edge cases.
        This thinking is logged for audit purposes. No external systems are modified.`,
        input_schema: { type: 'object', properties: { reasoning: { type: 'string', description: 'Step-by-step reasoning about the current situation' } }, required: ['reasoning'] },
    },
    schema: z.object({ reasoning: z.string().min(10) }),
    handler: async ({ reasoning }) => ({ acknowledged: true, reasoning_logged: true, message: 'Reasoning recorded. Proceed with your planned action.', reasoning }),
};