import { prisma } from '../../db/prisma.js';
import { DAY_MS, indiaLabel } from '../../lib/dates.js';

/** Weeks shown in the sign-ups chart. */
const CHART_WEEKS = 6;

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** Admin home screen (matches `AdminSummary`). */
export async function adminSummary() {
  const now = Date.now();
  const chartStart = new Date(now - CHART_WEEKS * 7 * DAY_MS);

  const [
    workers,
    companies,
    activeJobs,
    pendingVerifications,
    openReports,
    openTickets,
    jobsWithoutPay,
    signups,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'worker', deletedAt: null } }),
    prisma.company.count(),
    prisma.job.count({ where: { status: 'active', removedByAdmin: false } }),
    prisma.company.count({ where: { verification: 'pending' } }),
    prisma.jobReport.count({ where: { status: 'open' } }),
    prisma.supportTicket.count({ where: { status: 'open' } }),
    prisma.job.count({ where: { status: 'active', removedByAdmin: false, payMin: null, payMax: null } }),
    prisma.user.findMany({
      where: { role: { in: ['worker', 'employer'] }, createdAt: { gte: chartStart } },
      select: { role: true, createdAt: true },
    }),
  ]);

  // ── Things to do ──
  const attention: { id: string; text: string; link: string }[] = [];
  if (pendingVerifications) {
    const text = `${pendingVerifications} ${plural(pendingVerifications, 'company is', 'companies are')} waiting for approval`;
    attention.push({ id: 'pc', text, link: '/admin/verifications' });
  }
  if (openReports) {
    const text = `${openReports} job ${plural(openReports, 'report needs', 'reports need')} a decision`;
    attention.push({ id: 'rp', text, link: '/admin/reports' });
  }
  if (openTickets) {
    const text = `${openTickets} help ${plural(openTickets, 'request is', 'requests are')} waiting`;
    attention.push({ id: 'tk', text, link: '/admin/reports?tab=help' });
  }
  if (jobsWithoutPay) {
    const text = `${jobsWithoutPay} active ${plural(jobsWithoutPay, 'job has', 'jobs have')} no pay shown`;
    attention.push({ id: 'np', text, link: '/admin/jobs' });
  }

  // ── New workers and companies per week, oldest week first ──
  const signupsPerWeek = Array.from({ length: CHART_WEEKS }, (_, i) => {
    const end = now - (CHART_WEEKS - 1 - i) * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const inWeek = signups.filter(
      (user) => user.createdAt.getTime() > start && user.createdAt.getTime() <= end,
    );
    return {
      week: indiaLabel(new Date(end), 'dayMonth'),
      workers: inWeek.filter((user) => user.role === 'worker').length,
      // Each employer sign-up creates one company.
      companies: inWeek.filter((user) => user.role === 'employer').length,
    };
  });

  return {
    workers,
    companies,
    activeJobs,
    pendingVerifications,
    openReports,
    openTickets,
    attention,
    signupsPerWeek,
  };
}
