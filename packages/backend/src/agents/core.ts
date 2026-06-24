import Anthropic from '@anthropic-ai/sdk';
import { env } from '@sai/shared';
import type { ToolCall, RagChunk, ThinkingBlock } from '@sai/shared';
import { getToolsForAgent } from '../tools/registry.js';
import type { AgentType } from '../tools/registry.js';
import { runGuardrail, computeConfidence } from './guardrails.js';
import { customerContext } from './prompts.js';
import { agentLogger } from '../lib/logger.js';


export type AgentEvent =
| { type: 'token', content: string }
| { type: 'tool_start', tool: string, input: unknown }
| { type: 'tool_done', tool: string, output: unknown, durationMs: number }
| { type: 'tool_error', tool: string, error: string }
| { type: 'tool_blocked', tool: string, reason: string, approvalId?: string }
| { type: 'thinking', content: string }
| { type: 'done', response: string; trace: AgentTrace }

export interface AgentTrace {
    agentType: AgentType
    toolCalls: ToolCall[]
    ragChunks: RagChunk[]
    thinkingBlocks: ThinkingBlock[]
    confidence: number
    inputTokens: number
    outputTokens: number
    thinkingTokens: number
    cacheReadTokens: number
    costUsdCents: number
    durationMs: number
    outcome: string
}

export interface AgentRunOptions {
    agentType: AgentType
    messages: Anthropic.MessageParam[]
    systemPrompt: string
    conversationId: string
    customerId?: string
    useExtendedThinking?: boolean
}

function estimateCostCents(model: string, input: number, output: number, thinking: number, cache: number): number {
    const p = model.includes('haiku')
        ? { input: 0.0000008, output: 0.000004, cache: 0.00000008 }
        : { input: 0.000003,  output: 0.000015, cache: 0.0000003  };
    // p.* is dollars-per-token; multiply by 100 converts dollars → cents
    return Math.round(((input + thinking) * p.input + output * p.output + cache * p.cache) * 100);
}

export async function* runAgent(options: AgentRunOptions): AsyncGenerator<AgentEvent> {
    const startTime = Date.now()
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const model = 'claude-sonnet-4-6'
    const { definitions: tools, handlers } = getToolsForAgent(options.agentType)

    const log = agentLogger(options.conversationId, options.agentType);
    log.info({model, toolCount: tools.length, hasCustomer: !!options.customerId }, 'agent run started');

    const toolCalls: ToolCall[] = []
    const ragChunks: RagChunk[] = []
    const thinkingBlocks: ThinkingBlock[] = []

    let inputTokens = 0
    let outputTokens = 0
    let thinkingTokens = 0
    let cacheReadTokens = 0;

    let fullResponse = ''
    let lastThinkReasoning = ''
    let outcome = 'resolved';
    let approvalQueued = false
    let toolErrorCount = 0

    const messages: Anthropic.MessageParam[] = [...options.messages]

    const system: Anthropic.TextBlockParam[] = [
        { type: 'text', text: options.systemPrompt, cache_control: { type: 'ephemeral' } },
        ...(options.customerId
            ? [{ type: 'text' as const, text: customerContext(options.customerId) }]
            : []),
    ];

    const MAX_ITERATIONS = 10
    let iterations = 0

    while (iterations < MAX_ITERATIONS) {
        iterations++

        const params: Anthropic.MessageCreateParamsStreaming = {
            model,
            max_tokens: 8192,
            system,
            tools,
            messages,
            stream: true
        }

        if (options.useExtendedThinking && env.ENABLE_EXTENDED_THINKING) {
            // (params as any).thinking = { type: 'adaptive' }; // 'adaptive' is not a valid type
            // (params as any).effort = 'high'  // top-level 'effort' doesn't exist
            (params as any).thinking = { type: 'enabled', budget_tokens: 5000 }
        }

        const stream = client.messages.stream(params)

        let currentToolUseId = ''
        let currentToolName = ''
        let currentToolInputStr = ''
        let currentContentType = ''
        let currentText = ''

        const assistantBlocks: Anthropic.ContentBlockParam[] = [];

        for await ( const event of stream) {

            if (event.type === 'content_block_start') {
                currentContentType = event.content_block.type;

                // When a new text block starts and fullResponse is non-empty and doesn't already end with whitespace, inject a single
                //  space into both fullResponse and the token stream. That closes the gap between pre-tool and post-tool text segments.
                if (event.content_block.type === 'text' && fullResponse.length > 0 && !/\s$/.test(fullResponse)) {
                    fullResponse += ' '
                    yield { type: 'token', content: ' ' }
                }

                if (event.content_block.type === 'tool_use') {
                    currentToolUseId = event.content_block.id
                    currentToolName = event.content_block.name
                    currentToolInputStr = ''
                    yield {
                        type: 'tool_start',
                        tool: currentToolName,
                        input: {}
                    }
                }
            }

            if (event.type === 'content_block_delta') {

                if (event.delta.type === 'text_delta') {
                    currentText += event.delta.text
                    fullResponse += event.delta.text;
                    yield {type: 'token', content: event.delta.text};
                }

                if (event.delta.type === 'input_json_delta') {
                    currentToolInputStr += event.delta.partial_json;
                }

                if (event.delta.type === 'thinking_delta')
                    yield {type: 'thinking', content: event.delta.thinking};
            }


            if (event.type === 'content_block_stop') {
                if (currentContentType === 'text' && currentText.trim()) {
                    assistantBlocks.push({type: 'text', text: currentText});
                }

                if (currentContentType === 'thinking') {
                    const b = (event as any).content_block as ThinkingBlock;
                    if (b) thinkingBlocks.push(b);
                }

                if (currentContentType === 'tool_use' && currentToolName) {
                    assistantBlocks.push({
                        type: 'tool_use',
                        id: currentToolUseId,
                        name: currentToolName,
                        input: JSON.parse(currentToolInputStr || '{}')
                    });
                }
            }

            if (event.type === 'message_start' && event.message.usage) {
                inputTokens += event.message.usage.input_tokens;
                cacheReadTokens += (event.message.usage as any).cache_read_input_tokens ?? 0;
            }

            if (event.type === 'message_delta' && event.usage) {
                outputTokens += event.usage.output_tokens;
                // Thinking tokens are a subset of output_tokens (the model's reasoning),
                // reported separately under output_tokens_details. Calls without extended
                // thinking won't have this field, hence the ?? 0.
                thinkingTokens += event.usage.output_tokens_details?.thinking_tokens ?? 0;
            }
        }

        const finalMessage = await stream.finalMessage()

        if (assistantBlocks.length > 0) {
            messages.push({ role: 'assistant', content: assistantBlocks })
        }

        if (finalMessage.stop_reason === 'end_turn') {
            log.info({ iteration: iterations, stopReason: finalMessage.stop_reason }, 'agent ended turn (no tool call)');
            break
        }

        if (finalMessage.stop_reason === 'tool_use') {
            const toolNames = assistantBlocks
                .filter(b => b.type === 'tool_use')
                .map(b => (b as Anthropic.ToolUseBlockParam).name);

            log.info({ iteration: iterations, tools: toolNames }, 'agent requested tools');
            const toolResultBlocks: Anthropic.ToolResultBlockParam[] = []

            for (const block of assistantBlocks) {
                if (block.type !== 'tool_use') {
                    continue
                }

                const toolInput = block.input as Record<string, unknown>
                if (block.name === 'think') {
                    lastThinkReasoning = (toolInput.reasoning as string) ?? ''
                }

                const { result: guardrail, approvalId } = await runGuardrail(
                    block.name,
                    toolInput,
                    options.agentType,
                    options.conversationId,
                    lastThinkReasoning
                )
                if (!guardrail.allowed) {

                    if (guardrail.action === 'queue_approval') {
                        approvalQueued = true
                        outcome = 'pending_approval'
                    }

                    if (guardrail.action === 'escalate') {
                        outcome = 'escalated'
                    }

                    log.warn({ tool: block.name, action: guardrail.action, reason: guardrail.reason }, 'tool blocked by guardrail');
                    yield {
                        type: 'tool_blocked',
                        tool: block.name,
                        reason: guardrail.reason,
                        ...(approvalId ? { approvalId } : {})
                    }


                    toolResultBlocks.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: JSON.stringify({
                            blocked: true,
                            reason: guardrail.reason,
                            action: guardrail.action,
                            approvalId: approvalId ?? null,
                            message: guardrail.action === 'queue_approval' ? `Action queued for approval (ID: ${approvalId}). Inform the customer it is pending review.` : `Action escalated: ${guardrail.reason}`
                        })
                    })

                    continue
                }

                const handler = handlers[block.name]
                if (!handler) {
                    log.error({ tool: block.name }, 'unknown tool requested')

                    toolResultBlocks.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: JSON.stringify({
                            error: `Unknown tool: ${block.name}` }),
                        is_error: true });

                    continue
                }

                const parsedResult = handler.schema.safeParse(toolInput)
                if (!parsedResult.success) {
                    toolErrorCount++
                    const errMsg = parsedResult.error.issues.map(i => i.message).join(', ')

                    log.warn({ tool: block.name, error: errMsg }, 'tool input failed schema validation');
                    yield {
                        type: 'tool_error',
                        tool: block.name,
                        error: errMsg
                    }
                    toolResultBlocks.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: JSON.stringify({ error: errMsg}),
                        is_error: true,
                    })

                    continue
                }

                const toolStart = Date.now()
                try {
                    const output = await handler.handler(parsedResult.data)
                    const durationMs = Date.now() - toolStart

                    log.info({ tool: block.name, durationMs }, 'tool succeeded');

                    if (block.name === 'search_knowledge_base' && Array.isArray((output as any).chunks)) {
                        ragChunks.push(...(output as any).chunks)
                    }

                    toolCalls.push({
                        tool: block.name,
                        input: toolInput,
                        output,
                        durationMs
                    });

                    yield {
                        type: 'tool_done',
                        tool: block.name,
                        output,
                        durationMs
                    };

                    toolResultBlocks.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: JSON.stringify(output ?? { ok: true })
                    });
                } catch (err) {
                    toolErrorCount++
                    const errMsg = err instanceof Error ? err.message : 'Tool execution failed'

                    log.error({ tool: block.name, err: errMsg }, 'tool execution threw');

                    yield {
                        type: 'tool_error',
                        tool: block.name,
                        error: errMsg
                    };

                    toolCalls.push({
                        tool: block.name,
                        input: toolInput,
                        output: null,
                        durationMs: Date.now() - toolStart,
                        error: errMsg
                    });

                    toolResultBlocks.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: JSON.stringify({ error: errMsg }),
                        is_error: true
                    });
                }
            }

            messages.push({ role: 'user', content: toolResultBlocks })
        }
    }

    const costUsdCents = estimateCostCents(model, inputTokens, outputTokens, thinkingTokens, cacheReadTokens)
    const confidence = computeConfidence({
        ragScores: ragChunks.map(c => c.score),
        toolCallCount: toolCalls.length,
        toolErrorCount,
        escalated: outcome === 'escalated',
        approvalQueued
    })

    yield {
        type: 'done',
        response: fullResponse,
        trace: {
            agentType: options.agentType,
            toolCalls,
            ragChunks,
            thinkingBlocks,
            confidence,
            inputTokens,
            outputTokens,
            thinkingTokens,
            cacheReadTokens,
            costUsdCents,
            durationMs: Date.now() - startTime,
            outcome
        }
    }
}