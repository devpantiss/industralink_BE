import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { requireJsonBody } from './middleware/json-body.js';
import { notFoundHandler } from './middleware/not-found.js';
import { apiLimiter } from './middleware/rate-limit.js';
import { filesRouter } from './modules/files/files.routes.js';
import { apiRouter } from './routes.js';

/** Builds the Express app. Kept separate from server.ts so tests can use it without opening a port. */
export function createApp() {
  const app = express();

  // Behind a hosting proxy (Render etc.) this makes req.ip the real client IP.
  if (env.isProduction) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS }));
  app.use(express.json({ limit: '2mb' }));
  app.use(requireJsonBody);
  app.use(pinoHttp({ logger }));

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'error', database: 'down' });
    }
  });

  app.use('/api/v1', apiLimiter, apiRouter);
  app.use('/files', filesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
