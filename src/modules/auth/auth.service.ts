import { prisma } from '../../db/prisma.js';
import { notFound } from '../../lib/errors.js';
import { toUserDto } from '../users/user.mapper.js';
import {
  createEmployerAccount,
  createWorkerAccount,
  type NewEmployer,
  type NewWorker,
} from '../users/user.service.js';
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

/** The worker or employer finished the welcome steps. */
export async function completeOnboarding(userId: string) {
  const user = await prisma.user.update({ where: { id: userId }, data: { onboarded: true } });
  return toUserDto(user);
}

/** DEVELOPMENT ONLY. Creates a worker account and logs in, without OTP. */
export async function devSignupWorker(input: NewWorker, meta: SessionMeta) {
  return startSession(await createWorkerAccount(input), meta);
}

/** DEVELOPMENT ONLY. Creates an employer + company and logs in, without email checks. */
export async function devSignupEmployer(input: NewEmployer, meta: SessionMeta) {
  return startSession(await createEmployerAccount(input), meta);
}
