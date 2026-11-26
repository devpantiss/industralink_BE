import { prisma } from '../../db/prisma.js';
import type { SavePushTokenInput } from './push-token.schemas.js';

/**
 * Saves where to push for this login. One phone per login: a new id replaces the old one.
 * If the same phone was logged in to another account before, that account stops getting its pushes.
 */
export async function savePushToken(userId: string, sessionId: string, input: SavePushTokenInput) {
  await prisma.$transaction([
    prisma.pushToken.deleteMany({ where: { token: input.token, sessionId: { not: sessionId } } }),
    prisma.pushToken.upsert({
      where: { sessionId },
      create: { ...input, sessionId, userId },
      update: input,
    }),
  ]);
}

/** Stops pushes to this login (the person turned notifications off). */
export async function removePushToken(sessionId: string) {
  await prisma.pushToken.deleteMany({ where: { sessionId } });
}
