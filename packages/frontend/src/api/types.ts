// Frontend-only type mirrors for the backend API responses.
// These are NOT imported from @sai/shared — the frontend is standalone.

export interface Conversation {
    id:             string;
    customerId:     string;
    channel:        'chat' | 'webhook' | 'proactive';
    status:         'active' | 'resolved' | 'escalated' | 'pending_approval' | 'pending_review';
    agentType?:     string;
    createdAt:      string;
    resolvedAt?:    string;
    messageCount?:  number;
    confidence?:    number;
    costUsdCents?:  number;
    durationMs?:    number;
    outcome?:       string;
}

export interface Message {
    id:             string;
    conversationId: string;
    role:           'user' | 'assistant';
    content:        string;
    createdAt:      string;
}

export interface ToolCall {
    tool:       string;
    input:      unknown;
    output:     unknown;
    durationMs: number;
    error?:     string;
}

export interface AgentTrace {
    id:             string;
    conversationId: string;
    agentType:      string;
    toolCalls:      ToolCall[];
    ragChunks:      Array<{ filename: string; score: number; content: string }>;
    thinkingBlocks: Array<{ thinking: string }>;
    confidence:     number;
    outcome:        string;
    inputTokens:    number;
    outputTokens:   number;
    costUsdCents:   number;
    durationMs:     number;
    createdAt:      string;
}

export interface PendingApproval {
    id:             string;
    conversationId: string;
    agentType:      string;
    action:         string;
    params:         Record<string, unknown>;
    reasoning:      string;
    status:         'pending' | 'approved' | 'rejected' | 'expired';
    expiresAt:      string;
    createdAt:      string;
}

export interface DashboardMetrics {
    period:           string;
    conversations:    Array<{ status: string; channel: string; count: string }>;
    performance: {
        avg_confidence:   number;
        total_cost_cents: string;
        avg_duration_ms:  number;
        total_runs:       string;
        resolved:         number;
        escalated:        number;
        pending_approval: number;
    };
    pendingApprovals: number;
    dailyCosts:       Array<{ date: string; cost_cents: string; runs: string }>;
    agentBreakdown:   Array<{ agent_type: string; runs: string; avg_confidence: number; cost_cents: string }>;
}

// SSE event types streamed from POST /api/chat/stream
export type SSEEvent =
    | { type: 'init';         data: { conversationId: string } }
    | { type: 'triage';       data: { category: string; confidence: number } }
    | { type: 'token';        data: string }
    | { type: 'tool_start';   data: { tool: string } }
    | { type: 'tool_done';    data: { tool: string; durationMs: number } }
    | { type: 'tool_blocked'; data: { tool: string; reason: string; approvalId?: string } }
    | { type: 'thinking';     data: string }
    | { type: 'done';         data: { conversationId: string; outcome: string } };