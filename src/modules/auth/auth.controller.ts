import type { Request, Response } from 'express';
import { currentSessionId, currentUser } from '../../middleware/auth.js';
import { toUserDto } from '../users/user.mapper.js';
import { devLoginSchema, devSignupEmployerSchema, devSignupWorkerSchema } from './auth.schemas.js';
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

export async function completeOnboarding(req: Request, res: Response) {
  res.json(await authService.completeOnboarding(currentUser(req).id));
}

export async function devLogin(req: Request, res: Response) {
  const input = devLoginSchema.parse(req.body ?? {});
  res.json(await authService.devLogin(input, sessionMeta(req)));
}

export async function devUsers(_req: Request, res: Response) {
  res.json(await authService.listDevUsers());
}

export async function devSignupWorker(req: Request, res: Response) {
  const input = devSignupWorkerSchema.parse(req.body ?? {});
  res.status(201).json(await authService.devSignupWorker(input, sessionMeta(req)));
}

export async function devSignupEmployer(req: Request, res: Response) {
  const input = devSignupEmployerSchema.parse(req.body ?? {});
  res.status(201).json(await authService.devSignupEmployer(input, sessionMeta(req)));
}
