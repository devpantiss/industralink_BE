import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import type { Prisma, PushIdKind } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import { firebaseSender } from './firebase-sender.js';

/** One push notification, the same on every phone. */
export interface PushMessage {
  title: string;
  body: string;
  /** Screen to open on tap, e.g. /worker/messages?c=… (the same links as the bell). */
  link?: string;
  /** Android channel: chat messages, or job updates (shortlisted, offer…). */
  channel: 'messages' | 'updates';
  /** Pushes with the same group replace each other on the phone (one per chat). */
  group?: string;
}

/** A phone to send to. */
export interface PushTarget {
  token: string;
  kind: PushIdKind;
}

/** What happened for each target. "gone": the app was removed or logged out on that phone. */
export type PushOutcome = 'sent' | 'gone' | 'failed';

export interface PushSender {
  /** Returns one outcome per target, in the same order. */
  send(targets: PushTarget[], message: PushMessage): Promise<PushOutcome[]>;
}

/** Firebase when its key is set; otherwise push is off. Tests swap in a fake. */
let sender: PushSender | null = env.FIREBASE_SERVICE_ACCOUNT
  ? firebaseSender(env.FIREBASE_SERVICE_ACCOUNT)
  : null;

export function setPushSender(next: PushSender | null) {
  sender = next;
}

export const isPushOn = () => sender !== null;

/** Who gets a push, e.g. { id: userId } or every HR user: { companyId, role: 'employer' }. */
export type PushTo = Prisma.UserWhereInput;

/** Only accounts that can still be used: not deleted, not blocked, company not blocked. */
const canUseAccount: Prisma.UserWhereInput = {
  deletedAt: null,
  status: { not: 'blocked' },
  OR: [{ companyId: null }, { company: { status: { not: 'blocked' } } }],
};

/**
 * Sends now and reports what happened. Only to logins that are still open.
 * Phones that will never get pushes again are forgotten.
 */
export async function sendPushNow(to: PushTo, message: PushMessage) {
  const result = { phones: 0, sent: 0, gone: 0, failed: 0 };
  if (!sender) return result;

  const targets = await prisma.pushToken.findMany({
    where: {
      session: { revokedAt: null, expiresAt: { gt: new Date() } },
      user: { AND: [to, canUseAccount] },
    },
    select: { token: true, kind: true },
  });
  result.phones = targets.length;
  if (targets.length === 0) return result;

  const outcomes = await sender.send(targets, message);
  outcomes.forEach((outcome) => result[outcome]++);

  const gone = targets.filter((_, index) => outcomes[index] === 'gone').map((target) => target.token);
  if (gone.length) await prisma.pushToken.deleteMany({ where: { token: { in: gone } } });
  return result;
}

const running = new Set<Promise<void>>();

/**
 * Sends a push to every phone the users are logged in on, in the background.
 * Never throws and never makes the request wait: a lost push only means the person
 * sees the news when they open the app (the bell and the chat are the truth).
 */
export function sendPush(to: PushTo, message: PushMessage): void {
  if (!sender) return;
  const work: Promise<void> = sendPushNow(to, message)
    .then((result) => logger.debug({ ...result, channel: message.channel }, 'Push done'))
    .catch((error: unknown) => logger.warn({ err: error }, 'Push failed'))
    .finally(() => running.delete(work));
  running.add(work);
}

/** Waits for pushes still being sent (before shutdown, and in tests). */
export async function pushIdle(): Promise<void> {
  await Promise.all([...running]);
}
