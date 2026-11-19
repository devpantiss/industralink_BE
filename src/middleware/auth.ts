import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import type { Role, User } from '../generated/prisma/client.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyToken } from '../lib/jwt.js';

/** Only update session.lastUsedAt this often, to avoid a database write on every request. */
const LAST_USED_UPDATE_MS = 10 * 60 * 1000;

/**
 * Allows the request only with a valid `Authorization: Bearer <token>` header
 * whose session is still open and whose user is not blocked.
 * Sets `req.auth` for the next handlers.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) throw unauthorized();

  const payload = verifyToken(token);
  if (!payload) throw unauthorized('Your session has expired. Please log in again.', 'SESSION_EXPIRED');

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });
  const now = new Date();
  if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= now) {
    throw unauthorized('Your session has expired. Please log in again.', 'SESSION_EXPIRED');
  }
  if (session.user.status === 'blocked') {
    throw forbidden('This account is blocked. Please contact support.', 'BLOCKED');
  }

  if (now.getTime() - session.lastUsedAt.getTime() > LAST_USED_UPDATE_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: now } });
  }

  req.auth = { user: session.user, sessionId: session.id };
  next();
}

/** Use after requireAuth. Allows only the given roles, e.g. requireRole('admin'). */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw unauthorized();
    if (!roles.includes(req.auth.user.role)) throw forbidden();
    next();
  };
}

/** The logged-in user inside a handler protected by requireAuth. */
export function currentUser(req: Request): User {
  if (!req.auth) throw unauthorized();
  return req.auth.user;
}

/** The current session id inside a handler protected by requireAuth. */
export function currentSessionId(req: Request): string {
  if (!req.auth) throw unauthorized();
  return req.auth.sessionId;
}
