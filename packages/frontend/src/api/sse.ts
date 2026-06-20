import { useState, useRef, useCallback } from 'react';
import type { SSEEvent } from './types';

export interface ChatMessage {
    role:    'user' | 'assistant';
    content: string;
}

export interface ToolStatus {
    tool:        string;
    status:      'running' | 'done' | 'blocked';
    durationMs?: number;
    reason?:     string;
    approvalId?: string;
}

export interface StreamState {
    messages:       ChatMessage[];
    toolStatuses:   ToolStatus[];
    thinkingChunks: string[];
    triageCategory: string | null;
    triageConfidence: number | null;
    conversationId: string | null;
    isStreaming:    boolean;
    error:          string | null;
}

export function useChatStream(customerId: string) {
    const [state, setState] = useState<StreamState>({
        messages:         [],
        toolStatuses:     [],
        thinkingChunks:   [],
        triageCategory:   null,
        triageConfidence: null,
        conversationId:   null,
        isStreaming:      false,
        error:            null,
    });

    const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

    const sendMessage = useCallback(async (userMessage: string) => {
        const token = localStorage.getItem('agent_token');
        if (!token) throw new Error('Not authenticated');

        // Add user message to history immediately
        setState(prev => ({
            ...prev,
            messages: [...prev.messages, { role: 'user', content: userMessage }],
            toolStatuses: [],
            thinkingChunks: [],
            triageCategory: null,
            isStreaming: true,
            error: null,
        }));

        try {
            const res = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    message:     userMessage,
                    customerId,
                    conversationId: state.conversationId ?? undefined,
                }),
            });

            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

            const reader = res.body.getReader();
            readerRef.current = reader;
            const decoder = new TextDecoder();
            let assistantContent = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                // Use indexed loop — for-of + indexOf would find the FIRST occurrence
                // of each line string, giving the wrong dataLine when event types repeat.
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (!line) continue; // noUncheckedIndexedAccess: lines[i] is string | undefined
                    if (line.startsWith('event: ')) {
                        const eventType = line.slice(7).trim();
                        const dataLine = lines[i + 1] ?? '';
                        const rawData = dataLine.startsWith('data: ') ? dataLine.slice(6) : '';

                        try {
                            const parsed = JSON.parse(rawData);
                            const event: SSEEvent = { type: eventType as any, data: parsed };
                            handleEvent(event);
                        } catch {
                            // token events carry plain-text data (not JSON) so JSON.parse throws.
                            // assistantContent accumulates synchronously in the outer scope;
                            // we slice off the last message if it's already assistant (replace it),
                            // otherwise append a new assistant message.
                            if (eventType === 'token') {
                                assistantContent += rawData;
                                setState(prev => ({
                                    ...prev,
                                    messages: [
                                        ...prev.messages.slice(0, -1),
                                        ...(prev.messages.at(-1)?.role === 'assistant'
                                            ? [{ role: 'assistant' as const, content: assistantContent }]
                                            : [prev.messages.at(-1)!, { role: 'assistant' as const, content: assistantContent }]),
                                    ],
                                }));
                            }
                        }
                    }
                }
            }
        } catch (err) {
            setState(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Stream error' }));
        } finally {
            setState(prev => ({ ...prev, isStreaming: false }));
            readerRef.current = null;
        }

        function handleEvent(event: SSEEvent) {
            setState(prev => {
                switch (event.type) {
                    case 'init':
                        return { ...prev, conversationId: event.data.conversationId };

                    case 'triage':
                        return { ...prev, triageCategory: event.data.category, triageConfidence: event.data.confidence };

                    case 'tool_start':
                        return { ...prev, toolStatuses: [...prev.toolStatuses, { tool: event.data.tool, status: 'running' }] };

                    case 'tool_done':
                        return { ...prev, toolStatuses: prev.toolStatuses.map(t => t.tool === event.data.tool && t.status === 'running' ? { ...t, status: 'done', durationMs: event.data.durationMs } : t) };

                    case 'tool_blocked':
                        return { ...prev, toolStatuses: prev.toolStatuses.map(t => t.tool === event.data.tool && t.status === 'running' ? { ...t, status: 'blocked', reason: event.data.reason, ...(event.data.approvalId ? { approvalId: event.data.approvalId } : {}) } : t) };

                    case 'thinking':
                        return { ...prev, thinkingChunks: [...prev.thinkingChunks, event.data] };

                    case 'done':
                        return { ...prev, conversationId: event.data.conversationId };

                    default:
                        return prev;
                }
            });
        }
    }, [customerId, state.conversationId]);

    const clearChat = useCallback(() => {
        setState({ messages: [], toolStatuses: [], thinkingChunks: [], triageCategory: null, triageConfidence: null, conversationId: null, isStreaming: false, error: null });
    }, []);

    return { ...state, sendMessage, clearChat };
}