import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { neon } from '@neondatabase/serverless';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDb>

export function createDb(connectionString: string) {
    const isNeon = connectionString.includes('neon.tech')

    if (isNeon) {
        // Neon's HTTP driver - works in serverless and long-running Node processes.
        // Uses HTTP/2 under the hood - no persistent TCP connection needed.
        const sql = neon(connectionString)
        return drizzleNeon(sql, { schema })
    }

    // Standard pg pool - used for local Docker and test environments.
    // Pool size of 10 is appropriate for a single backend process.
    let _db: Database | undefined

    const pool = new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    })

    return drizzlePg(pool, { schema })
}

// Singleton - one db instance per process.
// Import this everywhere instead of calling createDb() multiple times.
let _db: Database | undefined

export function getDb(connectionString: string): Database {
    if (!_db) {
        _db = createDb(connectionString)
    }

    return _db
}

// Re-export schema for convenience - consumers import from '@sai/shared/db'
export * from './schema.js'