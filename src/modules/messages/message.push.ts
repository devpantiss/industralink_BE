import { prisma } from '../../db/prisma.js';
import type { Message } from '../../generated/prisma/client.js';
import { sendPush } from '../push/push.service.js';
import type { Chat } from './chat-access.js';
import { previewOf } from './message.mapper.js';

/** Most unread messages one chat notification lists. */
const MAX_LINES = 5;

/**
 * A new message as a phone notification for the other side: the worker, or every HR user
 * of the company. Like WhatsApp, one notification per chat lists the unread messages,
 * titled e.g. "Konark Heavy Engineering (3 messages)"; each new one replaces it. Sent even when their app is open: the app
 * then decides what to show (nothing, if that chat is on screen).
 */
export function pushNewMessage(message: Message, chat: Chat) {
  const { worker, job } = chat.application;
  const toWorker = message.senderRole !== 'worker';
  const unread = toWorker ? chat.workerUnread : chat.companyUnread;

  sendPush(toWorker ? { id: chat.workerId } : { companyId: chat.companyId, role: 'employer' }, async () => {
    const latest =
      unread > 1
        ? await prisma.message.findMany({
            where: { applicationId: chat.applicationId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: Math.min(unread, MAX_LINES),
            select: { text: true },
          })
        : [message];
    const from = toWorker ? job.company.name : worker.user.name;
    return {
      title: unread > 1 ? `${from} (${unread} messages)` : from,
      body: latest
        .reverse()
        .map((line) => previewOf(line.text))
        .join('\n'),
      link: `/${toWorker ? 'worker' : 'employer'}/messages?c=${chat.applicationId}`,
      channel: 'messages',
      group: `chat-${chat.applicationId}`,
    };
  });
}
