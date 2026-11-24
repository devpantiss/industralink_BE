import type { Request, Response } from 'express';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import { sendMessageSchema, threadQuerySchema } from './message.schemas.js';
import * as messages from './message.service.js';

export async function inbox(req: Request, res: Response) {
  res.json(await messages.listThreads(currentUser(req)));
}

export async function thread(req: Request, res: Response) {
  const query = threadQuerySchema.parse(req.query);
  const applicationId = parseId(req.params.applicationId, 'Chat');
  res.json(await messages.openThread(currentUser(req), applicationId, query));
}

export async function send(req: Request, res: Response) {
  const input = sendMessageSchema.parse(req.body ?? {});
  const applicationId = parseId(req.params.applicationId, 'Chat');
  const { message, created } = await messages.sendMessage(currentUser(req), applicationId, input);
  // 201 for a new message, 200 when a retry found the one already saved.
  res.status(created ? 201 : 200).json(message);
}

export async function markRead(req: Request, res: Response) {
  await messages.markRead(currentUser(req), parseId(req.params.applicationId, 'Chat'));
  res.json({ ok: true });
}
