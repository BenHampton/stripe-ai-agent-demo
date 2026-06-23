import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { env, getDb, conversations, messages, agentTraces } from '@sai/shared';
import { orchestrate } from '../agents/orchestrator.js';
import type { AgentTrace } from '../agents/core.js';

export const chatRouter = new Hono();

const ChatSchema = z.object({
    message:        z.string().min(1).max(2000),
    conversationId: z.uuid().optional(),
    customerId:     z.string().min(1),
});

chatRouter.post('/stream',
    zValidator('json', ChatSchema),
    async (c) => {
        const { message, customerId } = c.req.valid('json');
        let { conversationId } = c.req.valid('json');
        const db = getDb(env.DATABASE_URL);

        // Create or resume conversation
        if (!conversationId) {
            const result = await db.insert(conversations).values({ customerId, channel: 'chat', status: 'active' }).returning();
            conversationId = result[0]!.id;
        }

        // Load history (last 20 messages for context window management)
        const history = await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt).limit(20);
        const anthropicHistory = history
            .filter(m => m.content && m.content.trim().length > 0) // filter empty rows
            .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));


        // Persist incoming user message
        await db.insert(messages).values({ conversationId, role: 'user', content: message });

        return streamSSE(c, async (stream) => {
            let fullResponse = ''; let lastTrace: AgentTrace | undefined;

            // Send conversation ID first so client can track the session
            await stream.writeSSE({ event: 'init', data: JSON.stringify({ conversationId }) });

            for await (const event of orchestrate({ userMessage: message, conversationId, customerId, history: anthropicHistory })) {
                if      (event.type === 'triage') {
                    await stream.writeSSE({ event: 'triage', data: JSON.stringify({ category: event.category, confidence: event.confidence }) });
                }
                else if (event.type === 'token') {
                    await stream.writeSSE({ event: 'token', data: event.content });

                }
                else if (event.type === 'tool_start')  {
                    await stream.writeSSE({ event: 'tool_start', data: JSON.stringify({ tool: event.tool }) })
                }
                else if (event.type === 'tool_done')  {
                    await stream.writeSSE({ event: 'tool_done', data: JSON.stringify({ tool: event.tool, durationMs: event.durationMs }) });
                }
                else if (event.type === 'tool_blocked') {
                    await stream.writeSSE({ event: 'tool_blocked', data: JSON.stringify({ tool: event.tool, reason: event.reason, approvalId: event.approvalId }) });
                }
                else if (event.type === 'thinking') {
                    await stream.writeSSE({ event: 'thinking',    data: event.content });
                }
                else if (event.type === 'done') {
                    fullResponse = event.response; lastTrace = event.trace;
                }
            }

            // Persist results
            if (fullResponse.trim()) {
                await db.insert(messages)
                    .values({ conversationId, role: 'assistant', content: fullResponse });
            }

            if (lastTrace) {
                await db.insert(agentTraces)
                    .values({ conversationId, agentType: 'billing', ...lastTrace });

                await db.update(conversations)
                    .set({ status: lastTrace.outcome === 'pending_approval' ? 'pending_approval' : 'resolved', resolvedAt: new Date() })
                    .where(eq(conversations.id, conversationId));
            }

            await stream.writeSSE({ event: 'done', data: JSON.stringify({ conversationId, outcome: lastTrace?.outcome }) });
        });
    },
);