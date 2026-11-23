import { prisma } from '../../db/prisma.js';
import { DAY_MS, indiaDayKey, indiaLabel, todayInIndia } from '../../lib/dates.js';
import { applicantCounts } from '../jobs/job.queries.js';

/** Jobs whose last date is this close get a "closes soon" reminder. */
const CLOSING_SOON_DAYS = 3;

/** Employer home screen (matches `EmployerSummary`). */
export async function employerSummary(companyId: string) {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * DAY_MS);
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const inCompany = { job: { companyId } };

  const [jobs, stages, interviewsThisWeek, hiredThisMonth, recent, cantAttend] = await Promise.all([
    prisma.job.findMany({
      where: { companyId },
      select: { id: true, title: true, status: true, deadline: true, removedByAdmin: true },
    }),
    prisma.application.groupBy({ by: ['stage'], where: inCompany, _count: { _all: true } }),
    prisma.interview.count({
      where: { at: { gte: now, lt: weekAhead }, application: { ...inCompany, stage: 'interview' } },
    }),
    prisma.application.count({
      where: {
        ...inCompany,
        stage: 'hired',
        events: { some: { type: 'hired', createdAt: { gte: monthAgo } } },
      },
    }),
    prisma.application.findMany({
      where: { ...inCompany, createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.application.findMany({
      where: { ...inCompany, stage: 'interview', interview: { response: 'cant_attend' } },
      select: { id: true, jobId: true, job: { select: { title: true } } },
    }),
  ]);

  const activeJobs = jobs.filter((job) => job.status === 'active' && !job.removedByAdmin);
  const counts = await applicantCounts(activeJobs.map((job) => job.id));

  // ── Things to do ──
  const attention: { id: string; text: string; link: string; action: string }[] = [];
  for (const job of activeJobs) {
    const fresh = counts(job.id).newApplicantsCount;
    if (fresh > 0) {
      const text = `${fresh} new ${fresh === 1 ? 'applicant' : 'applicants'} – ${job.title}`;
      attention.push({ id: `new-${job.id}`, text, link: `/employer/jobs/${job.id}`, action: 'Review' });
    }
  }
  for (const app of cantAttend) {
    const text = `A candidate can't attend the interview – ${app.job.title}`;
    attention.push({ id: `ca-${app.id}`, text, link: `/employer/jobs/${app.jobId}`, action: 'New time' });
  }
  const soon = new Date(todayInIndia().getTime() + CLOSING_SOON_DAYS * DAY_MS);
  for (const job of activeJobs) {
    if (job.deadline && job.deadline <= soon) {
      const text = `"${job.title}" closes soon`;
      attention.push({ id: `dl-${job.id}`, text, link: `/employer/jobs/${job.id}/edit`, action: 'Extend' });
    }
  }
  for (const job of jobs.filter((item) => item.status === 'draft')) {
    const text = `Draft not published – ${job.title}`;
    attention.push({ id: `dr-${job.id}`, text, link: `/employer/jobs/${job.id}/edit`, action: 'Finish' });
  }

  // ── Applicants per day, last 7 days (India time) ──
  const perDay = new Map<string, number>();
  for (const app of recent) {
    const key = indiaDayKey(app.createdAt);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const applicantsPerDay = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(now.getTime() - (6 - i) * DAY_MS);
    return { day: indiaLabel(day, 'weekday'), count: perDay.get(indiaDayKey(day)) ?? 0 };
  });

  // ── Hiring funnel: everyone who reached each step ──
  const byStage = new Map<string, number>(stages.map((row) => [row.stage, row._count._all]));
  const reached = (...names: string[]) => names.reduce((sum, name) => sum + (byStage.get(name) ?? 0), 0);
  const funnel = [
    { stage: 'Applied', count: stages.reduce((sum, row) => sum + row._count._all, 0) },
    { stage: 'Shortlisted', count: reached('shortlisted', 'interview', 'offer', 'hired') },
    { stage: 'Interview', count: reached('interview', 'offer', 'hired') },
    { stage: 'Hired', count: reached('hired') },
  ];

  return {
    openJobs: activeJobs.length,
    newApplicants: activeJobs.reduce((sum, job) => sum + counts(job.id).newApplicantsCount, 0),
    interviewsThisWeek,
    hiredThisMonth,
    attention,
    applicantsPerDay,
    funnel,
  };
}
