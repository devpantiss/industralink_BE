import { prisma } from '../../db/prisma.js';
import type { User } from '../../generated/prisma/client.js';
import { AppError, notFound } from '../../lib/errors.js';
import { deleteFile } from '../files/storage.js';
import { storeDocument, storeImageFromDataUrl } from '../files/upload.js';
import { toCompanyDocumentDto, toCompanyDto } from './company.mapper.js';
import type { UpdateCompanyInput } from './company.schemas.js';

const MAX_DOCUMENTS = 10;

/** The company of the logged-in employer. */
export function companyIdOf(user: User): string {
  if (!user.companyId) throw notFound('No company is linked to this account.');
  return user.companyId;
}

export async function getCompany(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw notFound('Company not found.');
  return toCompanyDto(company);
}

/** Same rule as worker photos: data URL = new logo, null/"" = remove, a link = no change. */
async function resolveLogo(companyId: string, logoUrl: string | null | undefined) {
  if (logoUrl === null || logoUrl === '') return null;
  if (logoUrl?.startsWith('data:')) return storeImageFromDataUrl(logoUrl, 'companies', companyId, 'logo');
  return undefined;
}

export async function updateCompany(companyId: string, input: UpdateCompanyInput) {
  const { location, logoUrl, resubmit, ...fields } = input;

  const before = await prisma.company.findUnique({ where: { id: companyId } });
  if (!before) throw notFound('Company not found.');

  const logoKey = await resolveLogo(companyId, logoUrl);
  const sendBackForReview = resubmit === true && before.verification === 'rejected';

  try {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        ...fields,
        ...(location !== undefined && { city: location?.city ?? null, state: location?.state ?? null }),
        ...(logoKey !== undefined && { logoKey }),
        ...(sendBackForReview && { verification: 'pending', rejectionReason: null }),
      },
    });
  } catch (error) {
    if (logoKey) await deleteFile(logoKey);
    throw error;
  }

  if (logoKey !== undefined && before.logoKey) await deleteFile(before.logoKey);

  return getCompany(companyId);
}

export async function listCompanyDocuments(companyId: string) {
  const docs = await prisma.companyDocument.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });
  return docs.map(toCompanyDocumentDto);
}

export async function uploadCompanyDocument(
  companyId: string,
  file: Express.Multer.File | undefined,
  type: string,
) {
  const count = await prisma.companyDocument.count({ where: { companyId } });
  if (count >= MAX_DOCUMENTS) {
    throw new AppError(409, 'TOO_MANY', `You can keep up to ${MAX_DOCUMENTS} documents. Delete one first.`);
  }

  const stored = await storeDocument(file, 'companies', companyId);
  try {
    const doc = await prisma.companyDocument.create({
      data: {
        companyId,
        type,
        name: (file?.originalname || 'document').slice(0, 120),
        storageKey: stored.key,
        sizeBytes: stored.sizeBytes,
        mimeType: stored.mimeType,
      },
    });
    return toCompanyDocumentDto(doc);
  } catch (error) {
    await deleteFile(stored.key);
    throw error;
  }
}

/** Proof documents can't be removed once the company is approved. */
export async function deleteCompanyDocument(companyId: string, documentId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { verification: true },
  });
  if (company?.verification === 'approved') {
    throw new AppError(409, 'LOCKED', "Your company is already verified, so its documents can't be removed.");
  }

  const doc = await prisma.companyDocument.findFirst({ where: { id: documentId, companyId } });
  if (!doc) throw notFound('Document not found.');

  await prisma.companyDocument.delete({ where: { id: doc.id } });
  await deleteFile(doc.storageKey);
}
