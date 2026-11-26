import { prisma } from '../../db/prisma.js';
import type { Company, CompanyDocument, User, VerificationStatus } from '../../generated/prisma/client.js';
import { HIRING_TYPE_LABEL, SECTOR_LABEL } from '../../lib/catalog.js';
import { AppError, notFound } from '../../lib/errors.js';
import { toNationalPhone } from '../../lib/phone.js';
import { fileUrl } from '../files/storage.js';
import { addNotifications, pushNotifications } from '../notifications/notification.service.js';
import { recordAudit } from './audit.service.js';
import type { DecideVerificationInput } from './admin.schemas.js';

type CompanyForReview = Company & { members: User[]; documents: CompanyDocument[] };

const label = (map: Record<string, string>, key: string | null) => (key ? (map[key] ?? key) : undefined);

/** One row in the admin "Approvals" list (matches `VerificationItem` in the dashboard types). */
function toVerificationItem(company: CompanyForReview) {
  const hr = company.members[0];
  const hrPhone = toNationalPhone(company.hrPhone);
  const sector = label(SECTOR_LABEL, company.sector) ?? 'Industry not set';

  return {
    id: company.id,
    kind: 'company' as const,
    title: company.name,
    subtitle: `${sector} · ${company.city || 'City not set'}`,
    submittedAt: company.createdAt.toISOString(),
    status: company.verification,
    details: {
      'GST number': company.gstNumber || 'Not given',
      'Company size': company.size || '—',
      'Hiring as': label(HIRING_TYPE_LABEL, company.hiringType) ?? 'Not given',
      Website: company.website || '—',
      'HR contact': hr
        ? `${company.hrName ?? hr.name}${company.hrDesignation ? ` (${company.hrDesignation})` : ''} · ${hr.email ?? '—'}`
        : '—',
      'HR mobile': hrPhone ? `+91 ${hrPhone}` : 'Not given',
      Address:
        [company.address, company.city, company.state, company.pincode].filter(Boolean).join(', ') || '—',
      'Plants / sites': company.sites.length ? company.sites.join(', ') : '—',
      About: company.about || '—',
    },
    documents: company.documents.map((doc) => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      url: fileUrl(doc.storageKey),
      mimeType: doc.mimeType,
      uploadedAt: doc.createdAt.toISOString(),
    })),
  };
}

export async function listCompanyVerifications(status: VerificationStatus) {
  const companies = await prisma.company.findMany({
    where: { verification: status },
    include: {
      members: { orderBy: { createdAt: 'asc' } },
      documents: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: { createdAt: status === 'pending' ? 'asc' : 'desc' }, // oldest waiting first
  });
  return companies.map(toVerificationItem);
}

/** Approve or reject a company. Notifies its HR users and records the action. */
export async function decideCompany(adminId: string, companyId: string, input: DecideVerificationInput) {
  const approved = input.decision === 'approve';
  const reason = approved ? null : input.reason!;

  const notices = await prisma.$transaction(async (tx) => {
    // Only a company that is still pending can be decided (two admins may click at once).
    const { count } = await tx.company.updateMany({
      where: { id: companyId, verification: 'pending' },
      data: approved
        ? { verification: 'approved', rejectionReason: null, verifiedAt: new Date(), status: 'active' }
        : { verification: 'rejected', rejectionReason: reason, verifiedAt: null },
    });
    if (count === 0) {
      const exists = await tx.company.findUnique({ where: { id: companyId }, select: { id: true } });
      if (!exists) throw notFound('Company not found.');
      throw new AppError(409, 'ALREADY_DONE', 'This was already reviewed by another admin.');
    }

    const members = await tx.user.findMany({ where: { companyId }, select: { id: true } });
    if (approved) {
      await tx.user.updateMany({ where: { companyId, status: 'pending' }, data: { status: 'active' } });
    }

    const notices = members.map((member) => ({
      userId: member.id,
      title: approved ? 'Company verified ✓' : 'Verification not approved',
      body: approved ? 'You can now publish jobs.' : `Reason: ${reason}`,
      link: '/employer/company',
    }));
    await addNotifications(notices, tx);

    await recordAudit(
      {
        actorId: adminId,
        action: approved ? 'company.approve' : 'company.reject',
        targetType: 'company',
        targetId: companyId,
        details: reason ? { reason } : undefined,
      },
      tx,
    );
    return notices;
  });
  pushNotifications(notices);
}
