import type { Request, Response } from 'express';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import * as notifications from './notification.service.js';

export async function list(req: Request, res: Response) {
  res.json(await notifications.listNotifications(currentUser(req).id));
}

export async function markRead(req: Request, res: Response) {
  await notifications.markRead(currentUser(req).id, parseId(req.params.id, 'Notification'));
  res.json({ ok: true });
}

export async function markAllRead(req: Request, res: Response) {
  await notifications.markAllRead(currentUser(req).id);
  res.json({ ok: true });
}
