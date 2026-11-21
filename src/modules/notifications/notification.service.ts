import { prisma } from '../../db/prisma.js';
import type { Db } from '../../db/types.js';

export interface NewNotification {
  userId: string;
  title: string;
  body: string;
  link?: string;
}

/** Adds in-app notifications. (Push notifications through Firebase come later.) */
export async function notify(items: NewNotification[], db: Db = prisma): Promise<void> {
  if (items.length) await db.notification.createMany({ data: items });
}
