import { env } from '../../config/env.js';
import { closeSession, closeUser } from '../../realtime/live-hub.js';
import { prisma } from '../../db/prisma.js';
import type { User } from '../../generated/prisma/client.js';
import { signToken } from '../../lib/jwt.js';
import { toUserDto, type UserDto } from '../users/user.mapper.js';
import { assertCanUseAccount } from '../users/account-access.js';

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

/** What every login endpoint returns (matches `AuthResponse` in the apps). */
export interface AuthResponse {
  token: string;
  user: UserDto;
}

/**
 * The last step of every login method (email + password, Google, and dev login):
 * checks the account, opens a session and returns the token.
 */
export async function startSession(user: User, meta: SessionMeta): Promise<AuthResponse> {
  const company = user.companyId ? await prisma.company.findUnique({ where: { id: user.companyId } }) : null;
  assertCanUseAccount({ ...user, company });

  const expiresAt = new Date(Date.now() + env.SESSION_DAYS * 24 * 60 * 60 * 1000);
  const [session, updatedUser] = await prisma.$transaction([
    prisma.session.create({
      data: { userId: user.id, expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) },
    }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ]);

  const token = signToken({ sub: user.id, role: user.role, sid: session.id });
  return { token, user: toUserDto(updatedUser) };
}

/** Logs out one device. Its live connection and push notifications stop. */
export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.$transaction([
    prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.pushToken.deleteMany({ where: { sessionId } }),
  ]);
  closeSession(sessionId);
}

/** Logs out every device of a user (used when blocking a user or resetting a password). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.pushToken.deleteMany({ where: { userId } }),
  ]);
  closeUser(userId);
}

/** Logs out every other device of a user (after a password change). This one stays. */
export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<void> {
  const others = await prisma.session.findMany({
    where: { userId, revokedAt: null, id: { not: keepSessionId } },
    select: { id: true },
  });
  if (!others.length) return;
  const ids = others.map((session) => session.id);
  await prisma.$transaction([
    prisma.session.updateMany({ where: { id: { in: ids } }, data: { revokedAt: new Date() } }),
    prisma.pushToken.deleteMany({ where: { sessionId: { in: ids } } }),
  ]);
  ids.forEach(closeSession);
}
