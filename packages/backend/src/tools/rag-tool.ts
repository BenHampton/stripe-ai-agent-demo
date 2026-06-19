import { z } from 'zod';
import type { RegisteredTool } from './registry.js';
import { retrieve } from '../services/rag.js';

export const ragTool: RegisteredTool<any> = {
    definition: {
        name: 'search_knowledge_base',
        description: `Search the internal knowledge base for policy and product information.
        Use for: refund eligibility, plan features, cancellation policy, payment failures, SLAs, escalation.
        Write queries as natural language questions: "What is the refund approval threshold?" not "refund threshold".
        Always cite the source document when using retrieved content.`,
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Natural language question' },
                category: { type: 'string', enum: ['billing', 'policies', 'plans', 'support', 'retention'] },
                top_k:    { type: 'number', description: 'Max results (default 5, max 8)' },
            },
            required: ['query']
        }
    },
    schema: z.object({
        query: z.string().min(3),
        category: z.enum(['billing', 'policies', 'plans', 'support', 'retention']).optional(),
        top_k: z.number().int().min(1).max(8).default(5)
    }),
    handler: async({ query, category, top_k}) => {
        const chunks = await retrieve(query, { topK: top_k, category })
        return {
            chunks,
            count: chunks.length,
            context: chunks.map(c => ({
                source: c.filename,
                title: c.title,
                score: c.score,
                content: c.content,
            }))
        }
    }
}