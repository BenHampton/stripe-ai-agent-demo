import pino from 'pino';
import { env } from '@sai/shared';

export const logger = pino({
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    ...(env.NODE_ENV !== 'production'
        ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }
        : {}),
});

// Child logger factory — attach context without mutating the base logger
export function agentLogger(conversationId: string, agentType: string) {
    return logger.child({ conversationId, agentType });
}