import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { logger } from './lib/logger.js';
import { pushIdle } from './modules/push/push.service.js';
import { attachLiveServer } from './realtime/live-server.js';

const server = createApp().listen(env.PORT, () => {
  logger.info(`API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  if (!env.FIREBASE_SERVICE_ACCOUNT)
    logger.info('Push notifications are off (FIREBASE_SERVICE_ACCOUNT is not set).');
  if (!env.GOOGLE_CLIENT_IDS.length) logger.info('Google sign-in is off (GOOGLE_CLIENT_IDS is not set).');
  if (env.DEV_LOGIN) logger.warn('Test login is ON (DEV_LOGIN=true). Never use this on a live server.');
});

// Live chat updates on the same port: ws://localhost:<PORT>/ws
const live = attachLiveServer(server);

/** Finish open requests and close the database before exiting (deploys, Ctrl+C). */
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  live.close();
  server.close(async () => {
    await pushIdle();
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
