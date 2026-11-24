import { prisma } from '../../db/prisma.js';
import type { Message, User } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import { type LiveEvent, sendToCompany, sendToEveryone, sendToUser } from '../../realtime/live-hub.js';
import {
  type Chat,
  type ChatSide,
  chatInclude,
  chatsOf,
  isMessagingOn,
  whyChatIsClosed,
} from './chat-access.js';
import { otherSide, toMessageDto } from './message.mapper.js';

/**
 * Live chat events. Called AFTER the change is saved, and never throws:
 * a lost event only means the app sees the change on its next refresh.
 */

/** Least time between two "typing" events from one person in one chat. */
const TYPING_GAP_MS = 2500;

type ChatRef = Pick<Chat, 'applicationId' | 'workerId' | 'companyId'>;

function sendToSide(chat: ChatRef, side: ChatSide, event: LiveEvent) {
  if (side === 'worker') sendToUser(chat.workerId, event);
  else sendToCompany(chat.companyId, event);
}

function sendToBothSides(chat: ChatRef, event: LiveEvent) {
  sendToSide(chat, 'worker', event);
  sendToSide(chat, 'company', event);
}

function safely(what: string, work: () => void | Promise<void>) {
  Promise.resolve()
    .then(work)
    .catch((error: unknown) => logger.warn({ err: error }, `Live event failed: ${what}`));
}

/** A new message: both sides get it, each as they would see it from the API. */
export function messageSent(message: Message, chat: Chat) {
  safely('message:new', () => {
    for (const side of ['worker', 'company'] as const) {
      sendToSide(chat, side, { type: 'message:new', message: toMessageDto(message, chat, side) });
    }
  });
}

/**
 * One side opened the chat. The other side's ticks turn "seen"; the same side's other
 * devices (or other HR users) clear their unread badge.
 */
export function chatRead(chat: ChatRef, side: ChatSide, at: Date) {
  safely('chat:read', () => {
    sendToBothSides(chat, {
      type: 'chat:read',
      applicationId: chat.applicationId,
      side,
      at: at.toISOString(),
    });
  });
}

/** The chat opened, closed or changed stage. The apps load it again. */
export function chatsChanged(where: {
  applicationId?: string;
  jobId?: string;
  workerId?: string;
  companyId?: string;
}) {
  safely('chat:changed', async () => {
    const chats = await prisma.conversation.findMany({
      where: {
        applicationId: where.applicationId,
        workerId: where.workerId,
        companyId: where.companyId,
        ...(where.jobId && { application: { jobId: where.jobId } }),
      },
      select: { applicationId: true, workerId: true, companyId: true },
    });
    for (const chat of chats) {
      sendToBothSides(chat, { type: 'chat:changed', applicationId: chat.applicationId });
    }
  });
}

/** The admin turned messaging on or off. */
export function messagingSwitched(enabled: boolean) {
  safely('messaging:changed', () => sendToEveryone({ type: 'messaging:changed', enabled }));
}

const lastTyping = new Map<string, number>();

/**
 * Someone is typing. Shown live to the other side only, never saved.
 * Ignored when it comes too often, from someone outside the chat, or in a closed chat.
 */
export async function onTyping(user: User, applicationId: string) {
  const key = `${user.id}:${applicationId}`;
  const now = Date.now();
  if (now - (lastTyping.get(key) ?? 0) < TYPING_GAP_MS) return;
  lastTyping.set(key, now);
  // Keep the map small: forget old entries now and then.
  if (lastTyping.size > 10_000) {
    for (const [oldKey, at] of lastTyping) if (now - at > TYPING_GAP_MS) lastTyping.delete(oldKey);
  }

  const owner = chatsOf(user);
  if (!owner) return;
  const chat = await prisma.conversation.findFirst({
    where: { applicationId, ...owner.where },
    include: chatInclude,
  });
  if (!chat || whyChatIsClosed(chat, await isMessagingOn())) return;
  sendToSide(chat, otherSide(owner.side), { type: 'chat:typing', applicationId, side: owner.side });
}
