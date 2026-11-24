import { prisma } from '../../db/prisma.js';
import type { ApplicationStage, Prisma, User } from '../../generated/prisma/client.js';
import { type AppError, forbidden, notFound } from '../../lib/errors.js';

/**
 * The two sides of a chat. On the company side, every HR user of the company
 * shares the chat and its unread count (like a shared business inbox).
 */
export type ChatSide = 'worker' | 'company';

/** Stages in which both sides can write. The chat opens at shortlisting. */
export const OPEN_STAGES: readonly ApplicationStage[] = ['shortlisted', 'interview', 'offer', 'hired'];

/** Everything a chat needs for the inbox and the rules, loaded in one query. */
export const chatInclude = {
  application: {
    select: {
      stage: true,
      worker: { select: { user: { select: { name: true, status: true, deletedAt: true } } } },
      job: {
        select: {
          title: true,
          removedByAdmin: true,
          company: { select: { name: true, hrName: true, status: true } },
        },
      },
    },
  },
} satisfies Prisma.ConversationInclude;

export type Chat = Prisma.ConversationGetPayload<{ include: typeof chatInclude }>;

/** The chats this user can see: a worker's own, or all of their company's. Admins have none. */
export function chatsOf(user: User): { side: ChatSide; where: Prisma.ConversationWhereInput } | null {
  if (user.role === 'worker') return { side: 'worker', where: { workerId: user.id } };
  if (user.role === 'employer' && user.companyId) {
    return { side: 'company', where: { companyId: user.companyId } };
  }
  return null;
}

/**
 * Finds a chat the user takes part in.
 * - Not their application at all: 404, so nobody learns that the chat exists.
 * - Their application, but not shortlisted yet: 403 NOT_ALLOWED.
 */
export async function findChat(user: User, applicationId: string): Promise<{ chat: Chat; side: ChatSide }> {
  const owner = chatsOf(user);
  if (!owner) throw notFound('Chat not found.');

  const chat = await prisma.conversation.findFirst({
    where: { applicationId, ...owner.where },
    include: chatInclude,
  });
  if (chat) return { chat, side: owner.side };

  const ownApplication = await prisma.application.count({
    where: {
      id: applicationId,
      ...(owner.side === 'worker' ? { workerId: user.id } : { job: { companyId: user.companyId! } }),
    },
  });
  if (ownApplication > 0) {
    throw forbidden('You can message once the worker is shortlisted.', 'NOT_ALLOWED');
  }
  throw notFound('Chat not found.');
}

/** The admin's "Messaging" switch. On when the settings row doesn't exist yet. */
export async function isMessagingOn(): Promise<boolean> {
  const settings = await prisma.platformSettings.findUnique({
    where: { id: 1 },
    select: { messagingEnabled: true },
  });
  return settings?.messagingEnabled ?? true;
}

/**
 * Why nobody can write in this chat right now, or null when both sides can.
 * The chat can always be read; this only decides sending.
 */
export function whyChatIsClosed(chat: Chat, messagingOn: boolean): AppError | null {
  const { stage, job, worker } = chat.application;

  if (!messagingOn) return forbidden('Messaging is turned off right now.', 'DISABLED');
  if (!OPEN_STAGES.includes(stage) || job.removedByAdmin) {
    return forbidden('This application is closed. You can still read the chat.', 'NOT_ALLOWED');
  }
  if (worker.user.deletedAt || worker.user.status === 'blocked') {
    return forbidden("This worker's account is no longer active.", 'NOT_ALLOWED');
  }
  if (job.company.status === 'blocked') {
    return forbidden('This company is no longer active on IndustriaLink.', 'NOT_ALLOWED');
  }
  return null;
}
