import { prisma } from '../../db/prisma.js';
import { openJobWhere, visibleCompanyWhere } from './job.queries.js';

/** What the landing site shows instead of the company name. */
const EMPLOYER_TYPE: Record<string, string> = {
  mining: 'Mining company',
  metals: 'Metals plant',
  shipping: 'Port operator',
  petroleum: 'Oil & gas contractor',
  logistics: 'Logistics company',
  automotive: 'Auto parts maker',
};

const dateOnly = (date: Date | null) => date?.toISOString().slice(0, 10);

const countBy = (values: string[]) => {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
};

/**
 * GET /public/feed: open jobs and counts for the landing site.
 * Only public facts: no company name, HR phone or exact address.
 */
export async function buildJobFeed() {
  const [jobs, verifiedEmployers] = await Promise.all([
    prisma.job.findMany({ where: openJobWhere(), orderBy: { postedAt: 'desc' } }),
    prisma.company.count({ where: visibleCompanyWhere }),
  ]);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    jobs: jobs.map((job) => {
      const walkIn = job.walkIn as { date?: string; time?: string } | null;
      return {
        id: job.id,
        title: job.title,
        trade: job.trade,
        sector: job.sector,
        employerType: EMPLOYER_TYPE[job.sector] ?? 'Employer',
        verified: true,
        city: job.city,
        state: job.state,
        payMin: job.payMin ?? undefined,
        payMax: job.payMax ?? undefined,
        payPeriod: job.payPeriod,
        shift: job.shift,
        jobType: job.jobType,
        experience: job.experience,
        openings: job.openings,
        benefits: job.benefits,
        postedAt: (job.postedAt ?? job.createdAt).toISOString(),
        deadline: dateOnly(job.deadline),
        walkIn: walkIn?.date && walkIn.time ? { date: walkIn.date, time: walkIn.time } : undefined,
      };
    }),
    totals: {
      jobs: jobs.length,
      openings: jobs.reduce((sum, job) => sum + job.openings, 0),
      verifiedEmployers,
    },
    bySector: countBy(jobs.map((job) => job.sector)),
    byTrade: countBy(jobs.map((job) => job.trade)),
    byPlace: countBy(jobs.map((job) => `${job.city}, ${job.state}`)),
  };
}
