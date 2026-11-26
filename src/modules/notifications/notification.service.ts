import { type Db, prisma } from '../../db/prisma.js';
import type { Notification } from '../../generated/prisma/client.js';
import { sendPush } from '../push/push.service.js';

export interface NewNotification {
  userId: string;
  title: string;
  body: string;
  link?: string;
}

/** The bell shows the newest ones only. */
const LIST_LIMIT = 30;

/** Adds bell notifications and sends each one as a push to the person's phones. */
export async function notify(items: NewNotification[]): Promise<void> {
  await addNotifications(items);
  pushNotifications(items);
}

/**
 * Adds bell notifications only. Inside a transaction, use this and call
 * pushNotifications() after it commits, so nobody gets a push for a change that was undone.
 */
export async function addNotifications(items: NewNotification[], db: Db = prisma): Promise<void> {
  if (items.length) await db.notification.createMany({ data: items });
}

/** The push for bell notifications that are already saved. Never throws. */
export function pushNotifications(items: NewNotification[]): void {
  for (const { userId, title, body, link } of items) {
    sendPush({ id: userId }, { title, body, link, channel: 'updates' });
  }
}

/** A notification as the apps see it (matches `AppNotification`). */
function toNotificationDto(item: Notification) {
  return {
    id: item.id,
    userId: item.userId,
    title: item.title,
    body: item.body,
    at: item.createdAt.toISOString(),
    read: item.readAt !== null,
    link: item.link ?? undefined,
  };
}

export async function listNotifications(userId: string) {
  const items = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
  });
  return items.map(toNotificationDto);
}

/** Someone else's or an unknown id changes nothing (same answer, nothing to leak). */
export async function markRead(userId: string, notificationId: string) {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
