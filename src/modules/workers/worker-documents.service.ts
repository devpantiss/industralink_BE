import { prisma } from '../../db/prisma.js';
import { AppError, invalid, notFound } from '../../lib/errors.js';
import { deleteFile } from '../files/storage.js';
import { storeDocument } from '../files/upload.js';
import { toWorkerDocumentDto } from './worker.mapper.js';

const MAX_DOCUMENTS = 20;

export async function listWorkerDocuments(userId: string) {
  const docs = await prisma.workerDocument.findMany({
    where: { workerId: userId },
    orderBy: { createdAt: 'desc' },
  });
  return docs.map(toWorkerDocumentDto);
}

export async function uploadWorkerDocument(
  userId: string,
  file: Express.Multer.File | undefined,
  type: string,
) {
  const count = await prisma.workerDocument.count({ where: { workerId: userId } });
  if (count >= MAX_DOCUMENTS) {
    throw new AppError(409, 'TOO_MANY', `You can keep up to ${MAX_DOCUMENTS} documents. Delete one first.`);
  }

  const stored = await storeDocument(file, 'workers', userId);
  try {
    // The first resume becomes the main one automatically.
    const hasDefault =
      type === 'resume' &&
      (await prisma.workerDocument.count({ where: { workerId: userId, isDefaultResume: true } })) > 0;

    const doc = await prisma.workerDocument.create({
      data: {
        workerId: userId,
        type,
        name: (file?.originalname || 'document').slice(0, 120),
        storageKey: stored.key,
        sizeBytes: stored.sizeBytes,
        mimeType: stored.mimeType,
        isDefaultResume: type === 'resume' && !hasDefault,
      },
    });
    return toWorkerDocumentDto(doc);
  } catch (error) {
    await deleteFile(stored.key);
    throw error;
  }
}

export async function deleteWorkerDocument(userId: string, documentId: string) {
  const doc = await prisma.workerDocument.findFirst({ where: { id: documentId, workerId: userId } });
  if (!doc) throw notFound('Document not found.');

  await prisma.$transaction(async (tx) => {
    await tx.workerDocument.delete({ where: { id: doc.id } });
    if (doc.isDefaultResume) {
      // Make the newest remaining resume the main one.
      const next = await tx.workerDocument.findFirst({
        where: { workerId: userId, type: 'resume' },
        orderBy: { createdAt: 'desc' },
      });
      if (next) await tx.workerDocument.update({ where: { id: next.id }, data: { isDefaultResume: true } });
    }
  });
  await deleteFile(doc.storageKey);
}

export async function setDefaultResume(userId: string, documentId: string) {
  const doc = await prisma.workerDocument.findFirst({ where: { id: documentId, workerId: userId } });
  if (!doc) throw notFound('Document not found.');
  if (doc.type !== 'resume') {
    throw invalid('Only a resume can be set as your main resume.', 'NOT_RESUME');
  }

  await prisma.$transaction([
    prisma.workerDocument.updateMany({ where: { workerId: userId }, data: { isDefaultResume: false } }),
    prisma.workerDocument.update({ where: { id: doc.id }, data: { isDefaultResume: true } }),
  ]);
}
