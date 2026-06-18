CREATE TYPE "public"."agent_type" AS ENUM('triage', 'billing', 'knowledge', 'retention');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."conversation_channel" AS ENUM('chat', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'resolved', 'escalated', 'pending_approval');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('pending', 'running', 'completed', 'failed', 'compensating', 'compensated');--> statement-breakpoint
CREATE TABLE "agent_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rag_chunks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"thinking_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" real,
	"outcome" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"thinking_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd_cents" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" text NOT NULL,
	"channel" "conversation_channel" DEFAULT 'chat' NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"agent_type" "agent_type",
	"stripe_event_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "conversations_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" text NOT NULL,
	"token_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"content_hash" text NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_documents_filename_unique" UNIQUE("filename")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"token_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"action" text NOT NULL,
	"params" jsonb NOT NULL,
	"reasoning" text NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"type" text NOT NULL,
	"status" "workflow_status" DEFAULT 'pending' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_traces" ADD CONSTRAINT "agent_traces_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_document_id_kb_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_approvals" ADD CONSTRAINT "pending_approvals_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trace_conversation_idx" ON "agent_traces" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "trace_agent_type_idx" ON "agent_traces" USING btree ("agent_type");--> statement-breakpoint
CREATE INDEX "trace_created_at_idx" ON "agent_traces" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conv_customer_idx" ON "conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "conv_status_idx" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conv_channel_idx" ON "conversations" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "conv_stripe_event_idx" ON "conversations" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX "chunk_document_idx" ON "kb_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "chunk_category_idx" ON "kb_chunks" USING btree ("category");--> statement-breakpoint
CREATE INDEX "msg_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "approval_status_idx" ON "pending_approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approval_expires_idx" ON "pending_approvals" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "workflow_status_idx" ON "workflows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_conversation_idx" ON "workflows" USING btree ("conversation_id");