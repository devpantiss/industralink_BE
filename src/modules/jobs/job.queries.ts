import { prisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { todayInIndia } from '../../lib/dates.js';
import type { ApplicantCounts } from './job.mapper.js';

/** Companies whose jobs workers may see. */
export const visibleCompanyWhere = {
  verification: 'approved',
  status: { not: 'blocked' },
} satisfies Prisma.CompanyWhereInput;

/** Open for applications: published, not removed, last date not passed, company visible. */
export function openJobWhere(): Prisma.JobWhereInput {
  return {
    status: 'active',
    removedByAdmin: false,
    OR: [{ deadline: null }, { deadline: { gte: todayInIndia() } }],
    company: visibleCompanyWhere,
  };
}

/** Can be opened by workers (closed jobs too, so old links and saved jobs still work). */
export const viewableJobWhere = {
  status: { not: 'draft' },
  removedByAdmin: false,
  company: visibleCompanyWhere,
} satisfies Prisma.JobWhereInput;

/** Applicant numbers for many jobs at once. Withdrawn applications don't count. */
export async function applicantCounts(jobIds: string[]): Promise<(jobId: string) => ApplicantCounts> {
  if (jobIds.length === 0) return () => ({ applicantsCount: 0, newApplicantsCount: 0 });

  const where = { jobId: { in: jobIds }, stage: { not: 'withdrawn' } } satisfies Prisma.ApplicationWhereInput;
  const [all, unseen] = await Promise.all([
    prisma.application.groupBy({ by: ['jobId'], where, _count: { _all: true } }),
    prisma.application.groupBy({ by: ['jobId'], where: { ...where, seenAt: null }, _count: { _all: true } }),
  ]);
  const total = new Map(all.map((row) => [row.jobId, row._count._all]));
  const fresh = new Map(unseen.map((row) => [row.jobId, row._count._all]));

  return (jobId) => ({ applicantsCount: total.get(jobId) ?? 0, newApplicantsCount: fresh.get(jobId) ?? 0 });
}

/** For a worker: which of these jobs they saved and applied to. */
export async function workerJobExtras(workerId: string | null, jobIds: string[]) {
  if (!workerId || jobIds.length === 0) return () => ({ saved: false });

  const [saved, applications] = await Promise.all([
    prisma.savedJob.findMany({ where: { workerId, jobId: { in: jobIds } }, select: { jobId: true } }),
    prisma.application.findMany({
      where: { workerId, jobId: { in: jobIds }, stage: { not: 'withdrawn' } },
      select: { id: true, jobId: true },
    }),
  ]);
  const savedIds = new Set(saved.map((row) => row.jobId));
  const applied = new Map(applications.map((row) => [row.jobId, row.id]));

  return (jobId: string) => ({ saved: savedIds.has(jobId), appliedApplicationId: applied.get(jobId) });
}
