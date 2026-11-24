import { prisma } from '../../db/prisma.js';
import { chatsChanged } from '../messages/chat-events.js';
import type { AccountStatus } from '../../generated/prisma/client.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { revokeAllSessions } from '../auth/session.service.js';

/**
 * Creating and managing accounts. This does NOT check who the person is:
 * that is the login method's job (OTP, password, Google... not decided yet).
 * Every login method ends up calling these functions.
 */

export interface NewWorker {
  name: string;
  /** Already normalised: +91XXXXXXXXXX */
  phone: string;
}

export interface NewEmployer {
  name: string;
  /** Already lowercase */
  email: string;
  companyName: string;
}

export interface NewAdmin {
  name: string;
  email: string;
}

export function findUserByPhone(phone: string) {
  return prisma.user.findUnique({ where: { phone } });
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
}

/** Worker account: user + empty profile + settings, all or nothing. */
export async function createWorkerAccount({ name, phone }: NewWorker) {
  if (await findUserByPhone(phone)) {
    throw conflict('An account with this mobile number already exists. Please log in.');
  }
  return prisma.user.create({
    data: {
      role: 'worker',
      name,
      phone,
      settings: { create: {} },
      workerProfile: { create: {} },
    },
  });
}

/** Employer account: company (waiting for approval) + HR user + settings, all or nothing. */
export async function createEmployerAccount({ name, email, companyName }: NewEmployer) {
  if (await findUserByEmail(email)) {
    throw conflict('An account with this email already exists. Please log in.');
  }
  const platform = await prisma.platformSettings.findUnique({ where: { id: 1 } });
  const autoApprove = platform?.autoApproveCompanies ?? false;

  const company = await prisma.company.create({
    data: {
      name: companyName,
      verification: autoApprove ? 'approved' : 'pending',
      verifiedAt: autoApprove ? new Date() : null,
      members: {
        create: { role: 'employer', name, email: email.toLowerCase(), settings: { create: {} } },
      },
    },
    include: { members: true },
  });
  return company.members[0]!;
}

/** Admin account. Only created from the server (npm run admin:create), never through the API. */
export async function createAdminAccount({ name, email }: NewAdmin) {
  if (await findUserByEmail(email)) throw conflict('An account with this email already exists.');
  return prisma.user.create({
    data: { role: 'admin', name, email: email.toLowerCase(), onboarded: true, settings: { create: {} } },
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
