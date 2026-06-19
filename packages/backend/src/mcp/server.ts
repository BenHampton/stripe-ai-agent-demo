import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { toolRegistry } from '../tools/registry.js';

/**
 * MCP server that exposes the agent tool registry over the stdio transport.
 *
 * Clients (Claude Desktop, etc.) start this process and communicate via
 * stdin/stdout using the MCP JSON-RPC protocol. The server never starts
 * a network listener — transport is entirely over process stdio.
 *
 * Run standalone: node dist/mcp/server.js
 * Or via pnpm: pnpm mcp
 */

const server = new McpServer(
    { name: 'stripe-ai-agent', version: '1.0.0' },
);

// ── Register each tool via McpServer.registerTool() ──────────────────────────
// registerTool is the current API — the older server.tool() overloads are all
// deprecated. inputSchema accepts a full Zod schema (AnySchema), so we pass
// tool.schema directly. We still safeParse inside the handler to get a typed,
// validated payload for tool.handler (registry types schema as z.ZodType).

for (const [name, tool] of Object.entries(toolRegistry)) {
    server.registerTool(
        name,
        {
            description: tool.definition.description ?? '',
            inputSchema: tool.schema,
        },
        async (args) => {
            const parsed = tool.schema.safeParse(args);
            if (!parsed.success) {
                return {
                    content: [{ type: 'text' as const, text: JSON.stringify({ error: parsed.error.issues.map(i => i.message).join(', ') }) }],
                    isError: true,
                };
            }
            try {
                const result = await tool.handler(parsed.data);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
            } catch (err) {
                return {
                    content: [{ type: 'text' as const, text: JSON.stringify({ error: err instanceof Error ? err.message : 'Tool failed' }) }],
                    isError: true,
                };
            }
        },
    );
}

// ── Start server ──────────────────────────────────────────────────────────────

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Don't write to stdout — MCP uses stdout for protocol messages
    process.stderr.write('MCP server running (stdio transport)\n');
}

main().catch((err) => {
    process.stderr.write(`MCP server error: ${err}\n`);
    process.exit(1);
});