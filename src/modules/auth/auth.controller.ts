import type { Request, Response } from 'express';
import { currentSessionId, currentUser } from '../../middleware/auth.js';
import { toUserDto } from '../users/user.mapper.js';
import {
  changePasswordSchema,
  devLoginSchema,
  googleLoginSchema,
  loginSchema,
  signupEmployerSchema,
  signupWorkerSchema,
} from './auth.schemas.js';
import * as authService from './auth.service.js';
import { loginWithGoogle } from './google-auth.service.js';
import * as passwordAuth from './password-auth.service.js';
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
  res.json(await authService.completeOnboarding(currentUser(req)));
}

export async function signupWorker(req: Request, res: Response) {
  const input = signupWorkerSchema.parse(req.body ?? {});
  res.status(201).json(await passwordAuth.signupWorker(input, sessionMeta(req)));
}

export async function signupEmployer(req: Request, res: Response) {
  const input = signupEmployerSchema.parse(req.body ?? {});
  res.status(201).json(await passwordAuth.signupEmployer(input, sessionMeta(req)));
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body ?? {});
  res.json(await passwordAuth.loginWithPassword(input, sessionMeta(req)));
}

export async function changePassword(req: Request, res: Response) {
  const input = changePasswordSchema.parse(req.body ?? {});
  await passwordAuth.changePassword(currentUser(req), currentSessionId(req), input);
  res.json({ ok: true });
}

/** 201 when a new account was made (the apps then show the welcome steps), else 200. */
export async function googleLogin(req: Request, res: Response) {
  const input = googleLoginSchema.parse(req.body ?? {});
  const { created, ...auth } = await loginWithGoogle(input, sessionMeta(req));
  res.status(created ? 201 : 200).json(auth);
}

export async function devLogin(req: Request, res: Response) {
  const input = devLoginSchema.parse(req.body ?? {});
  res.json(await authService.devLogin(input, sessionMeta(req)));
}

export async function devUsers(_req: Request, res: Response) {
  res.json(await authService.listDevUsers());
}
