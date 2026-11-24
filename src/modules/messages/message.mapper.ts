import type { Message } from '../../generated/prisma/client.js';
import type { Chat, ChatSide } from './chat-access.js';

/** Longest last-message preview kept for the inbox. */
const PREVIEW_LENGTH = 120;

/** The inbox shows the start of the last message. */
export function previewOf(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ');
  return oneLine.length > PREVIEW_LENGTH ? `${oneLine.slice(0, PREVIEW_LENGTH - 1)}…` : oneLine;
}

/** Fields of the conversation row that belong to one side. */
export function sideFields(side: ChatSide) {
  return side === 'worker'
    ? ({ unread: 'workerUnread', lastReadAt: 'workerLastReadAt' } as const)
    : ({ unread: 'companyUnread', lastReadAt: 'companyLastReadAt' } as const);
}

export const otherSide = (side: ChatSide): ChatSide => (side === 'worker' ? 'company' : 'worker');

/** A chat in the inbox (matches `MessageThread` in the apps). */
export function toThreadDto(chat: Chat, side: ChatSide, canSend: boolean) {
  const { job, worker, stage } = chat.application;
  const workerName = worker.user.name;
  return {
    applicationId: chat.applicationId,
    jobTitle: job.title,
    companyName: job.company.name,
    workerName,
    otherName: side === 'worker' ? `${job.company.hrName ?? 'HR'} · ${job.company.name}` : workerName,
    stage,
    lastMessage: chat.lastMessageText ?? undefined,
    lastAt: chat.lastMessageAt?.toISOString(),
    unread: chat[sideFields(side).unread],
    canSend,
  };
}

/**
 * One message (matches `Message` in the apps), as `side` sees it.
 * Only on the viewer's own messages:
 * - `seen`: the other side has opened the chat since it was sent (the blue ticks).
 * - `clientId`: the app's own id, to match the message it showed while sending.
 */
export function toMessageDto(message: Message, chat: Chat, side: ChatSide) {
  const mine = (message.senderRole === 'worker') === (side === 'worker');
  const otherReadAt = chat[sideFields(otherSide(side)).lastReadAt];
  return {
    id: message.id,
    applicationId: message.applicationId,
    fromUserId: message.senderId,
    fromRole: message.senderRole === 'worker' ? ('worker' as const) : ('employer' as const),
    text: message.text,
    at: message.createdAt.toISOString(),
    ...(mine && {
      clientId: message.clientId ?? undefined,
      seen: otherReadAt !== null && message.createdAt <= otherReadAt,
    }),
  };
}
