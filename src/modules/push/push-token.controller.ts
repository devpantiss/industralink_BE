import type { Request, Response } from 'express';
import { currentSessionId, currentUser } from '../../middleware/auth.js';
import { savePushTokenSchema } from './push-token.schemas.js';
import * as pushTokens from './push-token.service.js';

export async function save(req: Request, res: Response) {
  const input = savePushTokenSchema.parse(req.body ?? {});
  await pushTokens.savePushToken(currentUser(req).id, currentSessionId(req), input);
  res.status(204).end();
}

export async function remove(req: Request, res: Response) {
  await pushTokens.removePushToken(currentSessionId(req));
  res.status(204).end();
}
