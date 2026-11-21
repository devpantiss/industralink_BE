import { prisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError, notFound } from '../../lib/errors.js';
import { toJobDto } from '../jobs/job.mapper.js';
import { applicantCounts } from '../jobs/job.queries.js';
import { notify } from '../notifications/notification.service.js';
import { recordAudit } from './audit.service.js';

/** All published and closed jobs (drafts are private to the company). Matches `AdminJobRow`. */
export async function listJobsForAdmin({ q, status }: { q?: string; status?: 'active' | 'closed' }) {
  const where: Prisma.JobWhereInput = { status: status ?? { not: 'draft' } };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
      { company: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const jobs = await prisma.job.findMany({
    where,
    include: { company: true },
    orderBy: [{ postedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
  });
  const counts = await applicantCounts(jobs.map((job) => job.id));
  return jobs.map((job) => ({ ...toJobDto(job, counts(job.id)), companyStatus: job.company.status }));
}

/** Takes a job down (fake, unsafe...): closes it, tells the company and records the action. */
export async function removeJob(adminId: string, jobId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({ where: { id: jobId, status: { not: 'draft' } } });
    if (!job) throw notFound('Job not found.');
    if (job.removedByAdmin) throw new AppError(409, 'ALREADY_DONE', 'This job was already removed.');

    await tx.job.update({
      where: { id: job.id },
      data: { status: 'closed', removedByAdmin: true, removedReason: reason },
    });

    const members = await tx.user.findMany({ where: { companyId: job.companyId }, select: { id: true } });
    await notify(
      members.map((member) => ({
        userId: member.id,
        title: 'Job removed by IndustriaLink',
        body: `"${job.title}" was removed. Reason: ${reason}`,
        link: '/employer/jobs?tab=closed',
      })),
      tx,
    );

    await recordAudit(
      { actorId: adminId, action: 'job.remove', targetType: 'job', targetId: job.id, details: { reason } },
      tx,
    );
  });
}
