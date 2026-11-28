import { prisma } from '../../db/prisma.js';
import { chatsChanged } from '../messages/chat-events.js';
import type { AccountStatus } from '../../generated/prisma/client.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { revokeAllSessions } from '../auth/session.service.js';

/**
 * Creating and managing accounts. This does NOT check who the person is:
 * that is the login method's job (email + password, or Google).
 * Every login method ends up calling these functions.
 *
 * Each account has an email and at least one way in: a password, Google, or both.
 */
interface SignInMethod {
  /** Already lowercase */
  email: string;
  /** From hashPassword(), when signing up with a password. */
  passwordHash?: string;
  /** When signing up with Google. */
  googleId?: string;
}

/** Worker: with Google there is no mobile number yet; the welcome steps ask for it (PUT /me/phone). */
export interface NewWorker extends SignInMethod {
  name: string;
  /** Already normalised: +91XXXXXXXXXX */
  phone?: string;
}

export interface NewEmployer extends SignInMethod {
  name: string;
  companyName: string;
}

export interface NewAdmin {
  name: string;
  email: string;
  passwordHash: string;
}

export function findUserByPhone(phone: string) {
  return prisma.user.findUnique({ where: { phone } });
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
}

/** Refuses an email that already has an account, saying how to get in. */
async function assertEmailFree(email: string) {
  const existing = await findUserByEmail(email);
  if (!existing) return;
  if (existing.googleId && !existing.passwordHash) {
    throw conflict(
      'This email already has an account with Google. Use “Sign in with Google”.',
      'EXISTS_GOOGLE',
    );
  }
  throw conflict('An account with this email already exists. Please log in.');
}

/** Worker account: user + empty profile + settings, all or nothing. */
export async function createWorkerAccount({ name, phone, email, passwordHash, googleId }: NewWorker) {
  await assertEmailFree(email);
  if (phone && (await findUserByPhone(phone))) {
    throw conflict('This mobile number is already used by another account.', 'PHONE_TAKEN');
  }
  return prisma.user.create({
    data: {
      role: 'worker',
      name,
      phone,
      email: email.toLowerCase(),
      passwordHash,
      googleId,
      settings: { create: {} },
      workerProfile: { create: {} },
    },
  });
}

/** Employer account: company (waiting for approval) + HR user + settings, all or nothing. */
export async function createEmployerAccount({
  name,
  email,
  companyName,
  passwordHash,
  googleId,
}: NewEmployer) {
  await assertEmailFree(email);
  const platform = await prisma.platformSettings.findUnique({ where: { id: 1 } });
  const autoApprove = platform?.autoApproveCompanies ?? false;

  const company = await prisma.company.create({
    data: {
      name: companyName,
      verification: autoApprove ? 'approved' : 'pending',
      verifiedAt: autoApprove ? new Date() : null,
      members: {
        create: {
          role: 'employer',
          name,
          email: email.toLowerCase(),
          passwordHash,
          googleId,
          settings: { create: {} },
        },
      },
    },
    include: { members: true },
  });
  return company.members[0]!;
}

/** Admin account. Only created from the server (npm run admin:create), never through the API. */
export async function createAdminAccount({ name, email, passwordHash }: NewAdmin) {
  if (await findUserByEmail(email)) throw conflict('An account with this email already exists.');
  return prisma.user.create({
    data: {
      role: 'admin',
      name,
      email: email.toLowerCase(),
      passwordHash,
      onboarded: true,
      settings: { create: {} },
    },
  });
}

/** Admin: block or unblock a user. Blocking logs them out everywhere at once. */
export async function setUserStatus(userId: string, status: AccountStatus) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('User not found.');
  if (user.role === 'admin') throw forbidden('Admin accounts cannot be changed here.');
  if (user.deletedAt) throw notFound('User not found.');

  const updated = await prisma.user.update({ where: { id: userId }, data: { status } });
  if (status === 'blocked') await revokeAllSessions(userId);
  // A blocked worker's chats become read-only for HR (and open again on unblock).
  if (user.role === 'worker' && user.status !== status) chatsChanged({ workerId: userId });
  return updated;
}
