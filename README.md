# stripe-ai-agent-demo

an autonomous subscription management platform where AI agents respond to customer chat, 
react to Stripe events without human prompting, coordinate through a multi-agent architecture, 
and surface every decision through a structured observability layer.

It has two agent entry points: a multi-agent chat system where Haiku triages and routes to specialized Sonnet agents for billing,
knowledge, and retention; and autonomous Stripe webhook handling where a failed payment or cancellation triggers an agent with no human prompting. 
Destructive actions over threshold route to a human-in-the-loop approval queue. 
The tool layer is MCP-native, exposable to Claude Desktop or any MCP host.

The project lives in a single stripe-ai-agent-demo/ pnpm monorepo.
Each package has its own package.json, tsconfig.json, and deployment target — sharing business logic only through @sai/shared via workspace imports.
At larger team size these would be independent repos; the monorepo keeps local dev frictionless while preserving the architectural boundaries.

### Architecture / Tech Stack

@sai/shared — internal package, imported by backend and MCP server
- @sai — short for Stripe AI

TypeScript 5.5, Drizzle ORM 0.36
Drizzle schema (7 tables: conversations, messages, agent_traces, pending_approvals, workflows, kb_documents, kb_chunks)
Zod env validation with fail-fast startup
Shared types and barrel exports

@sai/backend — Hono 4.x API server on Node 20 via @hono/node-server

Hono 4.x, @hono/node-server, @hono/zod-validator
Anthropic SDK 0.32 — claude-sonnet-4-6 (specialists + orchestrator), claude-haiku-4-5-20251001 (triage)
Stripe 17.x (test mode), Voyage AI voyage-3-large embeddings, pgvector HNSW cosine search
Neon/PostgreSQL via Drizzle, pino structured logging, jose 5.x JWT auth
@modelcontextprotocol/sdk 1.x (MCP server via stdio, lives inside backend package)
Vitest 2.x unit tests, Docker multi-stage build, GitHub Actions CI

@sai/frontend — standalone Vite 5 + React 18 SPA

Vite 5, React 18, React Router 6, TypeScript 5.5
Tailwind 3, shadcn/ui (Radix UI primitives), lucide-react
recharts (dashboard visualizations)
No shared imports from @sai/backend or @sai/shared — communicates with the backend exclusively via HTTP REST and SSE streaming


## PNPM
- verify links:
  - pnpm list --filter @sai/frontend 
  - pnpm list --filter @sai/backend 
  - pnpm list --filter @sai/shared 

## Drizzle
- create migration: `pnpm db:generate --name MIGRATION_NAME`
- create empty migration: `pnpm dotenv -e ../../.env -- drizzle-kit generate --custom --name=MIGRATION_NAME`
- apply migration: `pnpm db:migrate`
