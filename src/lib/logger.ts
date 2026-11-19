import { pino } from 'pino';
import { env } from '../config/env.js';

/** JSON logs in production, readable coloured logs in development, silent in tests. */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  transport:
    env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});
