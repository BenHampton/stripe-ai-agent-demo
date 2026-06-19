import { pgTable, pgEnum, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Enums
// Postgres enums are more efficient than text columns with CHECK constraints.
// Adding values requires a migration, which is intentional — it forces
// deliberate decisions about expanding valid states.

export const conversationChannelEnum = pgEnum('conversation_channel', [
    'chat',     // initiated by a human via the chat UI
    'webhook',  // initiated autonomously by a Stripe event
    'proactive',  // initiated by the agent (e.g. retention outreach to an at-risk customer)
]);

export const conversationStatusEnum = pgEnum('conversation_status', [
    'active',
    'resolved',
    'escalated',
    'pending_approval',
    'pending_review',
]);

export const messageRoleEnum = pgEnum('message_role', [
    'user',
    'assistant',
    'system',
]);

export const approvalStatusEnum = pgEnum('approval_status', [
    'pending',
    'approved',
    'rejected',
    'expired',
]);

export const workflowStatusEnum = pgEnum('workflow_status', [
    'pending',
    'running',
    'completed',
    'failed',
    'compensating',  // rolling back completed steps
    'compensated',   // rollback complete
]);

export const agentTypeEnum = pgEnum('agent_type', [
    'triage',
    'billing',
    'knowledge',
    'retention',
    'general'
]);

// Conversations
// A conversation is created once per interaction — either when a user opens
// the chat, or when a Stripe webhook event is received.
export const conversations = pgTable('conversations', (t) => ({
    id:         t.uuid().primaryKey().defaultRandom(),
    customerId: t.text('customer_id').notNull(),       // Stripe customer ID (cus_...)
    channel:    conversationChannelEnum('channel').notNull().default('chat'),
    status:     conversationStatusEnum('status').notNull().default('active'),
    agentType:  agentTypeEnum('agent_type'),            // which specialist handled it
    // stripeEventId is set for webhook-initiated conversations for idempotency
    stripeEventId: t.text('stripe_event_id').unique(),
    metadata:   t.jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt:  t.timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:  t.timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: t.timestamp('resolved_at', { withTimezone: true }),
}), (table) => [
    index('conv_customer_idx').on(table.customerId),
    index('conv_status_idx').on(table.status),
    index('conv_channel_idx').on(table.channel),
    index('conv_stripe_event_idx').on(table.stripeEventId),
]);

// Messages
// Each turn in a conversation. The full message history is loaded into
// the agent's context window on each request.
export const messages = pgTable('messages', (t) => ({
    id:             t.uuid().primaryKey().defaultRandom(),
    conversationId: t.uuid('conversation_id').notNull()
        .references(() => conversations.id, { onDelete: 'cascade' }),
    role:           messageRoleEnum('role').notNull(),
    content:        t.text('content').notNull(),
    // tokenCount is populated after the API response, used for cost tracking
    tokenCount:     t.integer('token_count'),
    createdAt:      t.timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}), (table) => [
    index('msg_conversation_idx').on(table.conversationId),
]);

// Agent Traces
// One trace per agent turn. Captures the full decision audit trail:
// what the agent retrieved, what it thought, what it did, what it cost.
export const agentTraces = pgTable('agent_traces', (t) => ({
    id:             t.uuid().primaryKey().defaultRandom(),
    conversationId: t.uuid('conversation_id').notNull()
        .references(() => conversations.id, { onDelete: 'cascade' }),
    agentType:      agentTypeEnum('agent_type').notNull(),
    // toolCalls: array of { tool, input, output, durationMs }
    toolCalls:      t.jsonb('tool_calls').$type<ToolCall[]>().notNull().default([]),
    // ragChunks: array of { chunkId, score, content } — what RAG retrieved
    ragChunks:      t.jsonb('rag_chunks').$type<RagChunk[]>().notNull().default([]),
    // thinkingBlocks: extended thinking output — the agent's reasoning chain
    thinkingBlocks: t.jsonb('thinking_blocks').$type<ThinkingBlock[]>().notNull().default([]),
    // Confidence 0-1. See Section 11 for how this is computed.
    confidence:     t.real('confidence'),
    outcome:        t.text('outcome'),           // resolved | escalated | approval_requested
    // Token usage from the Anthropic API response
    inputTokens:    t.integer('input_tokens').notNull().default(0),
    outputTokens:   t.integer('output_tokens').notNull().default(0),
    thinkingTokens: t.integer('thinking_tokens').notNull().default(0),
    cacheReadTokens: t.integer('cache_read_tokens').notNull().default(0),
    // Cost in USD cents (integer avoids floating point precision issues)
    costUsdCents:   t.integer('cost_usd_cents').notNull().default(0),
    durationMs:     t.integer('duration_ms'),
    createdAt:      t.timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}), (table) => [
    index('trace_conversation_idx').on(table.conversationId),
    index('trace_agent_type_idx').on(table.agentType),
    index('trace_created_at_idx').on(table.createdAt),
]);

// Approval Queue
// When an agent wants to perform a high-stakes action, it creates an approval
// entry instead of executing immediately. A human reviews and approves/rejects.
// Entries expire after 24h if not acted on.
export const pendingApprovals = pgTable('pending_approvals', (t) => ({
    id:             t.uuid().primaryKey().defaultRandom(),
    conversationId: t.uuid('conversation_id').notNull()
        .references(() => conversations.id, { onDelete: 'cascade' }),
    agentType:      agentTypeEnum('agent_type').notNull(),
    // action: machine-readable action descriptor
    action:         t.text('action').notNull(),       // e.g. "issue_refund"
    // params: the action's parameters — what will actually execute on approval
    params:         t.jsonb('params').$type<Record<string, unknown>>().notNull(),
    // reasoning: the agent's explanation of why it chose this action
    reasoning:      t.text('reasoning').notNull(),
    status:         approvalStatusEnum('status').notNull().default('pending'),
    reviewedBy:     t.text('reviewed_by'),             // user ID of the reviewer
    reviewedAt:     t.timestamp('reviewed_at', { withTimezone: true }),
    reviewNote:     t.text('review_note'),             // optional note from reviewer
    expiresAt:      t.timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt:      t.timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}), (table) => [
    index('approval_status_idx').on(table.status),
    index('approval_expires_idx').on(table.expiresAt),
]);


// Workflows
// Durable workflow state for multi-step operations (e.g. refund + cancel).
// Each step is tracked individually so failures can be compensated.
export const workflows = pgTable('workflows', (t) => ({
    id:             t.uuid().primaryKey().defaultRandom(),
    conversationId: t.uuid('conversation_id')
        .references(() => conversations.id, { onDelete: 'set null' }),
    type:           t.text('type').notNull(),          // e.g. "cancel_with_refund"
    status:         workflowStatusEnum('status').notNull().default('pending'),
    // steps: ordered array of { name, status, result, compensate }
    steps:          t.jsonb('steps').$type<WorkflowStep[]>().notNull().default([]),
    currentStep:    t.integer('current_step').notNull().default(0),
    input:          t.jsonb('input').$type<Record<string, unknown>>().notNull(),
    output:         t.jsonb('output').$type<Record<string, unknown>>(),
    error:          t.text('error'),
    createdAt:      t.timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:      t.timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt:    t.timestamp('completed_at', { withTimezone: true }),
}), (table) => [
    index('workflow_status_idx').on(table.status),
    index('workflow_conversation_idx').on(table.conversationId),
]);

// Knowledge Base Documents
// One row per source document. The content hash enables the upsert logic
// in the ingestion CLI — if the hash hasn't changed, don't re-embed.
export const kbDocuments = pgTable('kb_documents', (t) => ({
    id:          t.uuid().primaryKey().defaultRandom(),
    filename:    t.text('filename').notNull().unique(),
    title:       t.text('title').notNull(),
    category:    t.text('category').notNull(),
    version:     t.text('version').notNull().default('1.0'),
    // SHA-256 hash of the file content — used to detect changes during re-ingestion
    contentHash: t.text('content_hash').notNull(),
    chunkCount:  t.integer('chunk_count').notNull().default(0),
    ingestedAt:  t.timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:   t.timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}));

// Knowledge Base Chunks
// One row per chunk — a semantically coherent segment of a KB document.
// The embedding column uses pgvector's native vector type (1024 dimensions
// matching Voyage's voyage-3-large model output).
export const kbChunks = pgTable('kb_chunks', (t) => ({
    id:         t.uuid().primaryKey().defaultRandom(),
    documentId: t.uuid('document_id').notNull()
        .references(() => kbDocuments.id, { onDelete: 'cascade' }),
    filename:   t.text('filename').notNull(),    // denormalized for easier retrieval
    title:      t.text('title').notNull(),
    category:   t.text('category').notNull(),
    chunkIndex: t.integer('chunk_index').notNull(),
    content:    t.text('content').notNull(),
    // The vector column — requires pgvector extension.
    // 1024 dimensions = voyage-3-large output size.
    // Using sql template literal because Drizzle's vector() helper
    // requires drizzle-orm >= 0.36 with the pgvector extension option.
    embedding:  t.text('embedding').notNull(),  // stored as vector(1024) via migration SQL below
    tokenCount: t.integer('token_count').notNull(),
    createdAt:  t.timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}), (table) => [
    index('chunk_document_idx').on(table.documentId),
    index('chunk_category_idx').on(table.category),
]);

// Shared JSONB types
// TypeScript types for the JSONB columns above.

export interface ToolCall {
    tool:       string;
    input:      Record<string, unknown>;
    output:     unknown;
    durationMs: number;
    error?:     string;
}

export interface RagChunk {
    chunkId:  string;
    filename: string;
    title:    string;
    score:    number;
    content:  string;
}

export interface ThinkingBlock {
    type:    'thinking' | 'redacted_thinking';
    content: string;
}

export interface WorkflowStep {
    name:        string;
    status:      'pending' | 'running' | 'completed' | 'failed' | 'compensated';
    result?:     unknown;
    error?:      string;
    startedAt?:  string;
    completedAt?: string;
}