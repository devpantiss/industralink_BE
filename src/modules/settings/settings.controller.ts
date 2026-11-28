import type { Request, Response } from 'express';
import { currentUser } from '../../middleware/auth.js';
import { phoneSchema, updateSettingsSchema } from './settings.schemas.js';
import * as settings from './settings.service.js';

export async function getSettings(req: Request, res: Response) {
  res.json(await settings.getSettings(currentUser(req).id));
}

export async function updateSettings(req: Request, res: Response) {
  const input = updateSettingsSchema.parse(req.body ?? {});
  res.json(await settings.updateSettings(currentUser(req).id, input));
}

export async function setPhone(req: Request, res: Response) {
  const { phone } = phoneSchema.parse(req.body ?? {});
  res.json(await settings.setPhone(currentUser(req), phone));
}
