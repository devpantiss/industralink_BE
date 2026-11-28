import { type Db, prisma } from '../../db/prisma.js';
import { chatsChanged } from '../messages/chat-events.js';
import type { User } from '../../generated/prisma/client.js';
import { forbidden } from '../../lib/errors.js';
import { recordAudit } from '../admin/audit.service.js';
import { revokeAllSessions } from '../auth/session.service.js';
import { deleteFile } from '../files/storage.js';

/** Applications that are still waiting for a result. */
const OPEN_STAGES = ['applied', 'shortlisted', 'interview', 'offer'] as const;

/**
 * Worker: open applications are withdrawn, and the profile, documents, photo,
 * saved jobs and work history are erased. Returns the files to delete.
 */
async function eraseWorkerData(tx: Db, userId: string): Promise<string[]> {
  const openApps = await tx.application.findMany({
    where: { workerId: userId, stage: { in: [...OPEN_STAGES] } },
    select: { id: true },
  });
  for (const app of openApps) {
    await tx.application.update({
      where: { id: app.id },
      data: { stage: 'withdrawn', events: { create: { type: 'withdrawn', note: 'Account deleted' } } },
    });
  }

  const profile = await tx.workerProfile.findUnique({ where: { userId }, select: { photoKey: true } });
  const documents = await tx.workerDocument.findMany({
    where: { workerId: userId },
    select: { storageKey: true },
  });

  await tx.workerDocument.deleteMany({ where: { workerId: userId } });
  await tx.workHistory.deleteMany({ where: { workerId: userId } });
  await tx.savedJob.deleteMany({ where: { workerId: userId } });
  await tx.workerProfile.updateMany({
    where: { userId },
    data: {
      trade: null,
      experience: null,
      qualifications: [],
      licences: [],
      skills: [],
      languages: [],
      city: null,
      state: null,
      address: null,
      pincode: null,
      expectedPay: null,
      shiftPreference: null,
      employmentType: null,
      about: null,
      dob: null,
      gender: null,
      safetyTrainingHours: null,
      photoKey: null,
    },
  });
  await tx.userSettings.updateMany({ where: { userId }, data: { visibleToEmployers: false } });

  return [...documents.map((doc) => doc.storageKey), ...(profile?.photoKey ? [profile.photoKey] : [])];
}

/** Employer: the company's open jobs close; with no other HR user left, the company is hidden too. */
async function closeEmployerData(tx: Db, user: User) {
  if (!user.companyId) return;
  await tx.job.updateMany({
    where: { companyId: user.companyId, status: 'active' },
    data: { status: 'closed' },
  });

  const otherHr = await tx.user.count({
    where: { companyId: user.companyId, id: { not: user.id }, deletedAt: null, status: { not: 'blocked' } },
  });
  if (otherHr === 0) {
    await tx.company.update({ where: { id: user.companyId }, data: { status: 'blocked' } });
  }
}

/**
 * "Delete my account" (DPDP Act and app-store rule). Personal data is erased at once;
 * the user row stays as "Deleted user" so the other side's history still makes sense.
 */
export async function deleteOwnAccount(user: User) {
  if (user.role === 'admin') {
    throw forbidden('Admin accounts are removed by the IndustriaLink team.', 'ADMIN');
  }

  const files = await prisma.$transaction(async (tx) => {
    const toDelete = user.role === 'worker' ? await eraseWorkerData(tx, user.id) : [];
    if (user.role === 'employer') await closeEmployerData(tx, user);

    await tx.notification.deleteMany({ where: { userId: user.id } });
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: 'Deleted user',
        phone: null,
        email: null,
        googleId: null,
        passwordHash: null,
        deletedAt: new Date(),
      },
    });
    await recordAudit({ actorId: user.id, action: 'user.delete', targetType: 'user', targetId: user.id }, tx);
    return toDelete;
  });

  await revokeAllSessions(user.id);
  // Their chats become read-only for the other side.
  if (user.role === 'worker') chatsChanged({ workerId: user.id });
  else if (user.companyId) chatsChanged({ companyId: user.companyId });
  await Promise.all(files.map((key) => deleteFile(key)));
}
