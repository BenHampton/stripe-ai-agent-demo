import { createMiddleware } from 'hono/factory';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '@sai/shared';

/**
 * API Key middleware — for server-to-server calls (webhooks, cron triggers, MCP).
 * Accepts X-API-Key header matching API_KEY in env.
 */
export const apiKeyAuth = createMiddleware(async (c, next) => {
    const key = c.req.header('X-API-Key');
    if (key === env.API_KEY) { await next(); return; }
    c.status(401); return c.json({ error: 'Unauthorized' });
});

/**
 * JWT middleware — for frontend chat sessions.
 * Frontend exchanges customer_id for a short-lived JWT (via /api/auth/token).
 * Subsequent requests include the JWT in Authorization: Bearer header.
 */
const SECRET = new TextEncoder().encode(env.JWT_SECRET);

export const jwtAuth = createMiddleware(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        c.status(401); return c.json({ error: 'Missing Authorization header' });
    }
    try {
        const { payload } = await jwtVerify(authHeader.slice(7), SECRET);
        c.set('customerId', payload.sub as string);
        c.set('jwtPayload', payload);
        return next(); // return so all paths return a value (TS7030)
    } catch {
        c.status(401); return c.json({ error: 'Invalid or expired token' });
    }
});

/** Issue a short-lived JWT for a customer session (call from login/demo flow) */
export async function issueToken(customerId: string): Promise<string> {
    return new SignJWT({ sub: customerId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(SECRET);
}

/** Token endpoint — returns JWT for a given customer_id */
export async function tokenHandler(customerId: string) {
    return { token: await issueToken(customerId), expiresIn: 7200 };
}
