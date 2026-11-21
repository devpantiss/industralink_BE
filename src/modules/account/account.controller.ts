import type { Request, Response } from 'express';
import { currentUser } from '../../middleware/auth.js';
import { updateSettingsSchema } from './account.schemas.js';
import * as account from './account.service.js';

export async function getSettings(req: Request, res: Response) {
  res.json(await account.getSettings(currentUser(req).id));
}

export async function updateSettings(req: Request, res: Response) {
  const input = updateSettingsSchema.parse(req.body ?? {});
  res.json(await account.updateSettings(currentUser(req).id, input));
}
