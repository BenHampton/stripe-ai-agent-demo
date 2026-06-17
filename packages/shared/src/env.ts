import {z} from 'zod'

const envSchema = z.object({
    // Node 
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Port the Hono server binds to. Coerced from string → number.
    PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),

    // Database
    // Neon connection string or local Postgres URL from docker-compose
    // Format: postgresql://user:password@host:5432/dbname?sslmode=require
    DATABASE_URL: z.string().url(),

    // Anthropic 
    // API key from console.anthropic.com, used for both Claude and Voyage embeddings
    ANTHROPIC_API_KEY: z.string().min(1).startsWith('sk-ant-'),

    // Stripe
    // Secret key from dashboard.stripe.com/test/apikeys, use test key (sk_test_...)
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
        .default('true'),

    // Token budget for extended thinking (Anthropic recommends 4000+ for complex reasoning)
    EXTENDED_THINKING_BUDGET: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .default('8000'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        // Format Zod errors for human readability
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

        // Exit code 1, signals failure
        process.exit(1);
    }

    return result.data;
}

export const env = validateEnv();