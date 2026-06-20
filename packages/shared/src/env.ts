import { z } from 'zod';

/**
 * All environment variables required by the backend.
 * Validated at process startup — any missing or malformed value
 * causes an immediate, descriptive process exit.
 *
 * Add new variables here as you add new integrations.
 * Every variable has a comment explaining what it's for and where to get it.
 */
const envSchema = z.object({
    // Node
    // Controls logging verbosity and enables dev-only features
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Port the Hono server binds to. Coerced from string → number.
    PORT: z.string().regex(/^\d+$/).transform(Number).default(3000),

    // Database
    // Neon connection string or local Postgres URL from docker-compose
    // Format: postgresql://user:password@host:5432/dbname?sslmode=require
    DATABASE_URL: z.url(),

    // Anthropic 
    // API key from console.anthropic.com — used for both Claude and Voyage embeddings
    ANTHROPIC_API_KEY: z.string().min(1).startsWith('sk-ant-'),
    // Voyage AI API key — needed for voyage-3-large embeddings (separate from Anthropic key)
    VOYAGE_API_KEY: z.string().min(1).startsWith('pa-'),

    // Stripe 
    // Secret key from dashboard.stripe.com/test/apikeys — ALWAYS test key (sk_test_...)
    STRIPE_SECRET_KEY: z.string().min(1).startsWith('sk_test_'),

    // Webhook signing secret from: stripe listen --print-secret
    // OR from Stripe dashboard > Webhooks > your endpoint > Signing secret
    STRIPE_WEBHOOK_SECRET: z.string().min(1).startsWith('whsec_'),

    // Auth 
    // Secret used to sign JWT tokens. Generate with: openssl rand -base64 64
    // Minimum 32 chars enforced — shorter secrets are cryptographically weak
    JWT_SECRET: z.string().min(32),

    // The API key that clients must send in the X-API-Key header
    // Generate with: openssl rand -hex 32
    API_KEY: z.string().min(32),

    // CORS 
    // Comma-separated list of allowed origins for CORS
    // In dev: http://localhost:5173 (Vite default)
    // In prod: your actual frontend URL
    ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

    // Feature flags 
    // Enable extended thinking (costs more tokens — disable in budget-constrained envs)
    ENABLE_EXTENDED_THINKING: z
        .string()
        .transform((v) => v === 'true')
        .default(true),

    // Token budget for extended thinking (Anthropic recommends 4000+ for complex reasoning)
    EXTENDED_THINKING_BUDGET: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .default(8000),

    // ── RAG / Retrieval ──────────────────────────────────────────────────────
    // Max KB chunks returned per query. Higher = more context but more tokens.
    RAG_TOP_K: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .default(5),

    // Minimum cosine similarity (0–1) for a chunk to be returned.
    // Tuned against query-type embeddings — lower if relevant chunks get filtered.
    RAG_MIN_SCORE: z
        .string()
        .regex(/^\d*\.?\d+$/)
        .transform(Number)
        .default(0.65),
});


export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        // Format Zod errors into a readable list so the developer knows exactly
        // which variables are wrong and why — not just "validation failed"
        const errors = result.error.issues
            .map((issue) => {
                const path = issue.path.join('.') || 'unknown';
                return `  ✗ ${path}: ${issue.message}`;
            })
            .join('\n');

        // Write to stderr (not stdout) so it's visible even when stdout is piped
        process.stderr.write(
            `\nEnvironment validation failed:\n${errors}\n\n` +
            `Copy .env.example to .env and fill in the missing values.\n\n`
        );

        // Exit code 1 — signals failure to the process supervisor / CI
        process.exit(1);
    }

    return result.data;
}


export const env = validateEnv();
