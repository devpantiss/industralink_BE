import type { Request, Response } from 'express';
import { currentSessionId, currentUser } from '../../middleware/auth.js';
import { toUserDto } from '../users/user.mapper.js';
import { devLoginSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';
import { revokeSession, type SessionMeta } from './session.service.js';

function sessionMeta(req: Request): SessionMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

export async function me(req: Request, res: Response) {
  res.json(toUserDto(currentUser(req)));
}

export async function logout(req: Request, res: Response) {
  await revokeSession(currentSessionId(req));
  res.json({ ok: true });
}

export async function devLogin(req: Request, res: Response) {
  const input = devLoginSchema.parse(req.body ?? {});
  res.json(await authService.devLogin(input, sessionMeta(req)));
}

export async function devUsers(_req: Request, res: Response) {
  res.json(await authService.listDevUsers());
}
