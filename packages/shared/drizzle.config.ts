import { defineConfig } from 'drizzle-kit';

console.log('DATABASE_URL:', process.env.DATABASE_URL)

// For migrations, we need the direct (non-pooled) Neon URL.
// Set DATABASE_DIRECT_URL in .env for Neon; for local Docker it's the same as DATABASE_URL.
const connectionString =
    process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];

if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_DIRECT_URL must be set for migrations');
}

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './src/db/migrations',
    dialect: 'postgresql',
    dbCredentials: { url: connectionString },
    // Verbose output shows exactly what SQL drizzle-kit generates
    verbose: true,
    strict: true,
});