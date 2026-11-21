import { prisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { WORKING_DAYS_PER_MONTH } from '../../lib/catalog.js';
import { notFound } from '../../lib/errors.js';
import { toPublicJobDto, toWorkerJobDto, type JobWithCompany } from './job.mapper.js';
import { applicantCounts, openJobWhere, viewableJobWhere, workerJobExtras } from './job.queries.js';
import type { JobSearchInput } from './job.schemas.js';

export const PAGE_SIZE = 10;

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

/** "iti" should find "ITI" in a list, "welding" should find "Welding". */
const spellings = (word: string) => [
  ...new Set([word, word.toUpperCase(), word.charAt(0).toUpperCase() + word.slice(1)]),
];

/** Every word must match somewhere: "welder odisha" finds welder jobs in Odisha. */
function textFilter(q: string): Prisma.JobWhereInput[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({
      OR: [
        { title: contains(word) },
        { trade: contains(word) },
        { sector: contains(word) },
        { city: contains(word) },
        { state: contains(word) },
        { siteName: contains(word) },
        { company: { name: contains(word) } },
        { qualifications: { hasSome: spellings(word) } },
        { licences: { hasSome: spellings(word) } },
      ],
    }));
}

/** Pay at least `monthly` rupees a month (daily pay counted as 26 working days). */
function minPayFilter(monthly: number): Prisma.JobWhereInput {
  const atLeast = (amount: number): Prisma.JobWhereInput => ({
    OR: [{ payMax: { gte: amount } }, { payMax: null, payMin: { gte: amount } }],
  });
  return {
    OR: [
      { payPeriod: 'month', ...atLeast(monthly) },
      { payPeriod: 'day', ...atLeast(Math.ceil(monthly / WORKING_DAYS_PER_MONTH)) },
    ],
  };
}

function searchWhere(params: JobSearchInput): Prisma.JobWhereInput {
  const filters: Prisma.JobWhereInput[] = [openJobWhere()];
  if (params.q) filters.push(...textFilter(params.q));
  if (params.city) filters.push({ OR: [{ city: contains(params.city) }, { state: contains(params.city) }] });
  if (params.trade) filters.push({ trade: params.trade });
  if (params.sector) filters.push({ sector: params.sector });
  if (params.shift) filters.push({ shift: params.shift });
  if (params.minPay) filters.push(minPayFilter(params.minPay));
  if (params.foodStay) filters.push({ benefits: { hasSome: ['food', 'stay'] } });
  if (params.walkInOnly) filters.push({ jobType: 'walk_in' });
  return { AND: filters };
}

type SortRow = {
  id: string;
  postedAt: Date | null;
  createdAt: Date;
  payMin: number | null;
  payMax: number | null;
  payPeriod: string;
  city: string;
};

const monthlyPay = (job: SortRow) =>
  (job.payMax ?? job.payMin ?? 0) * (job.payPeriod === 'day' ? WORKING_DAYS_PER_MONTH : 1);
const postedTime = (job: SortRow) => (job.postedAt ?? job.createdAt).getTime();
const hasPay = (job: SortRow) => job.payMin !== null || job.payMax !== null;

function sortJobs(rows: SortRow[], sort: JobSearchInput['sort'], homeCity: string | null) {
  const home = homeCity?.toLowerCase();
  return rows.sort((a, b) => {
    // Jobs that hide the pay always go last.
    if (hasPay(a) !== hasPay(b)) return hasPay(a) ? -1 : 1;
    if (sort === 'pay' && monthlyPay(a) !== monthlyPay(b)) return monthlyPay(b) - monthlyPay(a);
    if (sort === 'nearest' && home) {
      const nearA = a.city.toLowerCase() === home;
      const nearB = b.city.toLowerCase() === home;
      if (nearA !== nearB) return nearA ? -1 : 1;
    }
    return postedTime(b) - postedTime(a);
  });
}

/** Shapes a list of jobs for a worker (or the public, when workerId is null). */
async function forWorker(jobs: JobWithCompany[], workerId: string | null) {
  const ids = jobs.map((job) => job.id);
  const [counts, extras] = await Promise.all([applicantCounts(ids), workerJobExtras(workerId, ids)]);
  return jobs.map((job) => toWorkerJobDto(job, counts(job.id), extras(job.id)));
}

/**
 * Job search for workers and the public page.
 * Step 1 finds every match with only the fields needed to sort (sorting by monthly pay
 * can't be done in one database query); step 2 loads the full jobs of the requested page.
 */
export async function searchJobs(params: JobSearchInput, workerId: string | null) {
  const where = searchWhere(params);
  const rows = await prisma.job.findMany({
    where,
    select: {
      id: true,
      postedAt: true,
      createdAt: true,
      payMin: true,
      payMax: true,
      payPeriod: true,
      city: true,
    },
  });

  let homeCity: string | null = null;
  if (params.sort === 'nearest' && workerId) {
    const profile = await prisma.workerProfile.findUnique({
      where: { userId: workerId },
      select: { city: true },
    });
    homeCity = profile?.city ?? null;
  }

  const pageIds = sortJobs(rows, params.sort, homeCity)
    .slice((params.page - 1) * PAGE_SIZE, params.page * PAGE_SIZE)
    .map((row) => row.id);

  const jobs = await prisma.job.findMany({ where: { id: { in: pageIds } }, include: { company: true } });
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const ordered = pageIds.map((id) => byId.get(id)).filter((job): job is JobWithCompany => !!job);

  return {
    items: await forWorker(ordered, workerId),
    total: rows.length,
    page: params.page,
    pageSize: PAGE_SIZE,
  };
}

async function findViewableJob(jobId: string) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, ...viewableJobWhere },
    include: { company: true },
  });
  if (!job) throw notFound("This job was removed or doesn't exist.");
  return job;
}

/** Job page for a worker. Closed jobs still open (so old links work); the apps show them as closed. */
export async function getJobForWorker(jobId: string, workerId: string) {
  const [job] = await forWorker([await findViewableJob(jobId)], workerId);
  return job!;
}

/** Job page for a shared link (no login). */
export async function getPublicJob(jobId: string) {
  const job = await findViewableJob(jobId);
  const counts = await applicantCounts([job.id]);
  return toPublicJobDto(job, counts(job.id));
}

export async function saveJob(workerId: string, jobId: string) {
  await findViewableJob(jobId);
  await prisma.savedJob.upsert({
    where: { workerId_jobId: { workerId, jobId } },
    create: { workerId, jobId },
    update: {},
  });
  return { saved: true };
}

export async function unsaveJob(workerId: string, jobId: string) {
  await prisma.savedJob.deleteMany({ where: { workerId, jobId } });
  return { saved: false };
}

/** Saved jobs, newest saved first. Jobs that were removed since are left out. */
export async function listSavedJobs(workerId: string) {
  const saved = await prisma.savedJob.findMany({
    where: { workerId, job: viewableJobWhere },
    include: { job: { include: { company: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return forWorker(
    saved.map((row) => row.job),
    workerId,
  );
}

/** Open jobs of one company, newest first (company page). */
export async function openJobsOfCompany(companyId: string, workerId: string) {
  const jobs = await prisma.job.findMany({
    where: { companyId, ...openJobWhere() },
    include: { company: true },
    orderBy: { postedAt: 'desc' },
  });
  return forWorker(jobs, workerId);
}
