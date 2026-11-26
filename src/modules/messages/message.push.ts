import type { Message } from '../../generated/prisma/client.js';
import { sendPush } from '../push/push.service.js';
import type { Chat } from './chat-access.js';
import { previewOf } from './message.mapper.js';

/**
 * A new message as a phone notification for the other side: the worker, or every HR user
 * of the company. Sent even when their app is open; the app then shows its own banner,
 * or nothing if that chat is on screen. Messages of one chat replace each other on the phone.
 */
export function pushNewMessage(message: Message, chat: Chat) {
  const { worker, job } = chat.application;
  const toWorker = message.senderRole !== 'worker';
  sendPush(toWorker ? { id: chat.workerId } : { companyId: chat.companyId, role: 'employer' }, {
    title: toWorker ? job.company.name : worker.user.name,
    body: previewOf(message.text),
    link: `/${toWorker ? 'worker' : 'employer'}/messages?c=${chat.applicationId}`,
    channel: 'messages',
    group: `chat-${chat.applicationId}`,
  });
}
