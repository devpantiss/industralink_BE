import { prisma } from '../../db/prisma.js';
import { chatsChanged } from '../messages/chat-events.js';
import type { ReportStatus } from '../../generated/prisma/client.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { recordAudit } from '../admin/audit.service.js';
import { removeJobWith } from '../admin/admin-jobs.service.js';
import { viewableJobWhere } from '../jobs/job.queries.js';
import { notify } from '../notifications/notification.service.js';
import type { ReportJobInput, ResolveReportInput } from './report.schemas.js';

/** Used when the admin removes a reported job without writing a reason. */
const DEFAULT_REMOVE_REASON = 'Reported by workers and checked by our team';

/** A worker reports a fake or unsafe job. Every admin is told. */
export async function reportJob(workerId: string, jobId: string, input: ReportJobInput) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, ...viewableJobWhere },
    include: { company: { select: { name: true } } },
  });
  if (!job) throw notFound("This job was removed or doesn't exist.");

  const already = await prisma.jobReport.count({ where: { jobId, reporterId: workerId, status: 'open' } });
  if (already) throw conflict('You already reported this job. Our team is checking it.', 'ALREADY_REPORTED');

  await prisma.jobReport.create({
    data: { jobId, reporterId: workerId, reason: input.reason, details: input.details ?? null },
  });

  const admins = await prisma.user.findMany({
    where: { role: 'admin', status: 'active', deletedAt: null },
    select: { id: true },
  });
  await notify(
    admins.map((admin) => ({
      userId: admin.id,
      title: 'Job reported',
      body: `${job.title} (${job.company.name}) was reported.`,
      link: '/admin/reports',
    })),
  );
}

/** Admin → Reports (matches `AdminReportRow`): newest first. */
export async function listReports(status: ReportStatus | 'all') {
  const reports = await prisma.jobReport.findMany({
    where: status === 'all' ? {} : { status },
    include: {
      job: { select: { title: true, status: true, company: { select: { name: true } } } },
      reporter: { select: { name: true } },
      resolvedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  // How many times each job was reported (all statuses), to spot repeated problems.
  const perJob = await prisma.jobReport.groupBy({
    by: ['jobId'],
    where: { jobId: { in: [...new Set(reports.map((report) => report.jobId))] } },
    _count: { _all: true },
  });
  const countFor = new Map(perJob.map((row) => [row.jobId, row._count._all]));

  return reports.map((report) => ({
    id: report.id,
    jobId: report.jobId,
    jobTitle: report.job.title,
    companyName: report.job.company.name,
    reporterName: report.reporter?.name ?? 'Deleted user',
    reason: report.reason,
    details: report.details ?? undefined,
    at: report.createdAt.toISOString(),
    status: report.status,
    resolvedAt: report.resolvedAt?.toISOString(),
    resolvedBy: report.resolvedBy?.name,
    jobStatus: report.job.status,
    reportsForJob: countFor.get(report.jobId) ?? 1,
  }));
}

/**
 * Admin decides on a report. "remove_job" takes the job down and closes every open
 * report for it; "dismiss" closes only this report.
 */
export async function resolveReport(adminId: string, reportId: string, input: ResolveReportInput) {
  const removedJobId = await prisma.$transaction(async (tx) => {
    const report = await tx.jobReport.findUnique({
      where: { id: reportId },
      include: { job: { select: { removedByAdmin: true } } },
    });
    if (!report) throw notFound('Report not found.');
    if (report.status !== 'open') throw new AppError(409, 'ALREADY_DONE', 'This report was already handled.');

    const resolved = { resolvedById: adminId, resolvedAt: new Date(), resolvedNote: input.note ?? null };

    if (input.action === 'remove_job') {
      // Another report may already have taken the job down.
      if (!report.job.removedByAdmin) {
        await removeJobWith(tx, adminId, report.jobId, input.note ?? DEFAULT_REMOVE_REASON);
      }
      await tx.jobReport.updateMany({
        where: { jobId: report.jobId, status: 'open' },
        data: { status: 'job_removed', ...resolved },
      });
      return report.jobId;
    }

    await tx.jobReport.update({ where: { id: report.id }, data: { status: 'dismissed', ...resolved } });
    await recordAudit(
      {
        actorId: adminId,
        action: 'report.dismiss',
        targetType: 'job',
        targetId: report.jobId,
        ...(input.note && { details: { note: input.note } }),
      },
      tx,
    );
    return null;
  });
  // Chats about a removed job become read-only.
  if (removedJobId) chatsChanged({ jobId: removedJobId });
}
