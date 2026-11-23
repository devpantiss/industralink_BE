import { type Db, prisma } from '../../db/prisma.js';
import type { Notification } from '../../generated/prisma/client.js';

export interface NewNotification {
  userId: string;
  title: string;
  body: string;
  link?: string;
}

/** The bell shows the newest ones only. */
const LIST_LIMIT = 30;

/** Adds in-app notifications. (Push notifications through Firebase come later.) */
export async function notify(items: NewNotification[], db: Db = prisma): Promise<void> {
  if (items.length) await db.notification.createMany({ data: items });
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
