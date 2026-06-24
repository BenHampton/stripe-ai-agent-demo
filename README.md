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

---

### Start Locally
- backend: `pnpm --filter @sai/backend dev`
- frontend: `pnpm --filter @sai/frontend dev`
- 
---

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

---

## PNPM
- verify links:
  - `pnpm list --filter @sai/frontend` 
  - `pnpm list --filter @sai/backend` 
  - `pnpm list --filter @sai/shared`
- build:
  - `pnpm --filter @sai/backend build`
  - `pnpm --filter @sai/frontend build`
  - `pnpm --filter @sai/shared build`
- lint:
  - `pnpm --filter @sai/backend lint`
  - `pnpm --filter @sai/frontend lint`
  - `pnpm --filter @sai/shared lint`
- typecheck:
  - `pnpm --filter @sai/backend typecheck`
  - `pnpm --filter @sai/frontend typecheck`
  - `pnpm --filter @sai/shared typecheck`

---

## Drizzle
- create migration: `pnpm db:generate --name MIGRATION_NAME`
- create empty migration: `pnpm dotenv -e ../../.env -- drizzle-kit generate --custom --name=MIGRATION_NAME`
- apply migration: `pnpm db:migrate`

---

## Stripe

#### Seed Test Data
- build: `pnpm --filter @sai/shared build`
- seed: `pnpm --filter @sai/shared seed:stripe`
- check seeded data: `pnpm --filter @sai/shared check:stripe`
- CLI
  - install via brew `brew install stripe/stripe-cli/stripe`
  - run `stripe login`

#### Clear Stripe Test Data (script | cli | manual)
- Script: run `pnpm --filter @sai/backend clear:stripe`
- CLI: purge all test data: `stripe fixtures delete --all`
- Manual: purge all test data:
  - go to https://dashboard.stripe.com/test/developers
  - find and Delete all test data

#### CLI Commands
- get customerId by email
  - `stripe customers list --email USERNAME@example.com | jq -r '.data[].id'`
- manually activate Alice's existing sub.
  - Find Alice's open invoice
    - `stripe invoices list --customer cus_UixfvcJsEi2xxg --status open | jq -r '.data[].id'`
  - Pay it (test mode, uses her attached tok_visa)
    - `stripe invoices pay <in_xxx>`

---

#### Webhook
1. cli
2. stripe login
3. stripe listen --forward-to localhost:3000/api/webhooks/stripe
   - copy the webhook secret printed here to STRIPE_WEBHOOK_SECRET in .env
4. run: `stripe trigger payment_intent.payment_failed`
5. run: `stripe trigger customer.subscription.deleted`
6. run: `stripe trigger charge.dispute.created`

---

## Knowledge Base

#### Ingest
- The script hashes each file's content (SHA-256) and compares against what's stored in the kb_documents table.
  - Skips the unchanged kbs
- use `INGEST_THROTTLE_MS=21000` to jitter around Voyage free-tier rate limits
- Run script:
  - run: `pnpm --filter @sai/backend ingest`
  - run script for specific file: `pnpm ingest --file=faq.md`
  - force reembedding: `pnpm --filter @sai/backend ingest --force`

---

## RAG (Retrieval-Augmented Generation)

#### Manually test retrieval 
- first build: `pnpm --filter @sai/shared build`
- run: `pnpm --filter @sai/backend test-retrieval`


## MCP

#### Connect to Claude Desktop
Add the MCP server to your Claude Desktop config file. The easiest way to open it is Settings → Developer → Edit Config in Claude Desktop, which opens the file in your system's config folder:

- macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
- Windows: %APPDATA%\Claude\claude_desktop_config.json (i.e. C:\Users\<you>\AppData\Roaming\Claude\)
- Linux: ~/.config/Claude/claude_desktop_config.json

```
{
  "mcpServers": {
    "stripe-ai-agent": {
      "command": "pnpm",
      "args": ["--filter", "@sai/backend", "mcp"],
      "cwd": "/path/to/stripe-ai-agent-demo",
      "env": {
        "ANTHROPIC_API_KEY":     "sk-ant-...",
        "STRIPE_SECRET_KEY":     "sk_test_...",
        "DATABASE_URL":          "postgresql://..."
      }
    }
  }
}
```
- After saving the config and restarting Claude Desktop, the tool hammer icon appears in the chat input. 
Claude Desktop can now call get_customer, search_knowledge_base, issue_refund, and all other registered tools directly. 
This is the interview demo moment: "I can also use these tools from any MCP client, including Claude Desktop."

