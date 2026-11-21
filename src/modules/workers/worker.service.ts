import { prisma } from '../../db/prisma.js';
import { conflict } from '../../lib/errors.js';
import { deleteFile } from '../files/storage.js';
import { storeImageFromDataUrl } from '../files/upload.js';
import { toWorkerProfileDto } from './worker.mapper.js';
import type { UpdateWorkerProfileInput } from './worker.schemas.js';

const profileInclude = {
  user: true,
  workHistory: { orderBy: { sortOrder: 'asc' } },
  documents: { select: { type: true } },
} as const;

export async function getWorkerProfile(userId: string) {
  // Every worker gets a profile at sign-up; upsert also covers older accounts without one.
  const profile = await prisma.workerProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
    include: profileInclude,
  });
  return toWorkerProfileDto(profile);
}

/** Decides what to do with photoUrl: new data URL = save, null/"" = remove, a link = no change. */
async function resolvePhoto(userId: string, photoUrl: string | null | undefined) {
  if (photoUrl === null || photoUrl === '') return null;
  if (photoUrl?.startsWith('data:')) return storeImageFromDataUrl(photoUrl, 'workers', userId, 'photo');
  return undefined;
}

export async function updateWorkerProfile(userId: string, input: UpdateWorkerProfileInput) {
  const { name, email, location, dob, photoUrl, workHistory, ...fields } = input;

  if (email) {
    const taken = await prisma.user.findFirst({
      where: { email, id: { not: userId } },
      select: { id: true },
    });
    if (taken) throw conflict('This email is already used by another account.');
  }

  const before = await prisma.workerProfile.upsert({ where: { userId }, create: { userId }, update: {} });
  const photoKey = await resolvePhoto(userId, photoUrl);

  try {
    await prisma.$transaction(async (tx) => {
      if (name !== undefined || email !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { name, email } });
      }

      await tx.workerProfile.update({
        where: { userId },
        data: {
          ...fields,
          ...(location !== undefined && { city: location?.city ?? null, state: location?.state ?? null }),
          ...(dob !== undefined && { dob: dob ? new Date(dob) : null }),
          ...(photoKey !== undefined && { photoKey }),
        },
      });

      if (workHistory) {
        await tx.workHistory.deleteMany({ where: { workerId: userId } });
        await tx.workHistory.createMany({
          data: workHistory.map((item, index) => ({
            workerId: userId,
            company: item.company,
            role: item.role,
            fromYear: item.from,
            toYear: item.to ?? null,
            sortOrder: index,
          })),
        });
      }
    });
  } catch (error) {
    if (photoKey) await deleteFile(photoKey); // the new photo is not used, remove it
    throw error;
  }

  if (photoKey !== undefined && before.photoKey) await deleteFile(before.photoKey);

  return getWorkerProfile(userId);
}
