import { prisma } from '../../db/prisma.js';
import type { User } from '../../generated/prisma/client.js';
import { invalid, notFound } from '../../lib/errors.js';
import { toUserDto } from '../users/user.mapper.js';
import type { DevLoginInput } from './auth.schemas.js';
import { startSession, type SessionMeta } from './session.service.js';

/**
 * DEVELOPMENT ONLY. Logs in as any existing user without a password or OTP,
 * so the apps can be built and tested before the real login method is chosen.
 * The route is not registered in production.
 */
export async function devLogin(input: DevLoginInput, meta: SessionMeta) {
  const user = await prisma.user.findUnique({
    where: input.userId
      ? { id: input.userId }
      : input.email
        ? { email: input.email }
        : { phone: input.phone },
  });
  if (!user) throw notFound('No user found with these details.');
  return startSession(user, meta);
}

/** DEVELOPMENT ONLY. Lists users to pick from for dev login. */
export async function listDevUsers() {
  return prisma.user.findMany({
    select: { id: true, role: true, name: true, email: true, phone: true, status: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
}

/** The worker or employer finished the welcome steps. A worker must have added a mobile number. */
export async function completeOnboarding(user: User) {
  if (user.role === 'worker' && !user.phone) {
    throw invalid('Add your mobile number first, so companies can call you.', 'PHONE_NEEDED');
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data: { onboarded: true } });
  return toUserDto(updated);
}
