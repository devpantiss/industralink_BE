import { prisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { toNationalPhone } from '../../lib/phone.js';
import type { UserListInput } from './admin.schemas.js';

/** Most rows one list returns. */
const LIST_LIMIT = 300;

const contains = (text: string) => ({ contains: text, mode: 'insensitive' as const });

async function listWorkers({ q, status }: UserListInput) {
  const digits = q?.replace(/\D/g, '');
  const where: Prisma.UserWhereInput = {
    role: 'worker',
    deletedAt: null,
    status,
    ...(q && {
      OR: [
        { name: contains(q) },
        { workerProfile: { city: contains(q) } },
        ...(digits ? [{ phone: { contains: digits } }] : []),
      ],
    }),
  };
  const users = await prisma.user.findMany({
    where,
    include: { workerProfile: { select: { city: true } } },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
  });
  return users.map((user) => ({
    id: user.id,
    role: 'worker' as const,
    name: user.name,
    contact: user.phone ? `+91 ${toNationalPhone(user.phone)}` : '—',
    city: user.workerProfile?.city ?? '—',
    status: user.status,
    joinedAt: user.createdAt.toISOString(),
  }));
}

/** Employers are listed by company: the company name, its HR email and verification. */
async function listEmployers({ q, status }: UserListInput) {
  const where: Prisma.UserWhereInput = {
    role: 'employer',
    deletedAt: null,
    // A blocked company counts as blocked even if the HR user itself is not.
    ...(status === 'blocked' && { OR: [{ status: 'blocked' }, { company: { status: 'blocked' } }] }),
    ...(status && status !== 'blocked' && { status, company: { status: { not: 'blocked' } } }),
    ...(q && {
      AND: [
        {
          OR: [
            { name: contains(q) },
            { email: contains(q) },
            { company: { name: contains(q) } },
            { company: { city: contains(q) } },
          ],
        },
      ],
    }),
  };
  const users = await prisma.user.findMany({
    where,
    include: { company: { select: { name: true, city: true, status: true, verification: true } } },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
  });
  return users.map((user) => ({
    id: user.id,
    role: 'employer' as const,
    name: user.company?.name ?? user.name,
    contact: user.email ?? '—',
    city: user.company?.city || '—',
    status: user.company?.status === 'blocked' ? ('blocked' as const) : user.status,
    verification: user.company?.verification ?? 'pending',
    joinedAt: user.createdAt.toISOString(),
  }));
}

/** Admin → Users (matches `AdminUserRow`). Newest first. */
export function listUsers(input: UserListInput) {
  return input.role === 'employer' ? listEmployers(input) : listWorkers(input);
}

/** Shown before blocking an employer: what their workers would lose. */
export async function userImpact(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
  if (!user?.companyId) return { activeJobs: 0, applicants: 0 };

  const activeJob = { companyId: user.companyId, status: 'active', removedByAdmin: false } as const;
  const [activeJobs, applicants] = await Promise.all([
    prisma.job.count({ where: activeJob }),
    prisma.application.count({ where: { job: activeJob, stage: { not: 'withdrawn' } } }),
  ]);
  return { activeJobs, applicants };
}
