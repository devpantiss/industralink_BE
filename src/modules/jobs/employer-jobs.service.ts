import { prisma } from '../../db/prisma.js';
import { Prisma, type JobStatus } from '../../generated/prisma/client.js';
import { conflict, forbidden, invalid, notFound } from '../../lib/errors.js';
import { toJobDto } from './job.mapper.js';
import { applicantCounts } from './job.queries.js';
import { checkJobRules, ensureCanPublish, type JobRuleState } from './job.rules.js';
import type { CreateJobInput, UpdateJobInput } from './job.schemas.js';

const toDate = (date: string | null) => (date ? new Date(date) : null);

/** Form fields -> database columns. Fields that were not sent stay undefined (= unchanged). */
function toJobData<T extends UpdateJobInput>(input: T) {
  const { location, walkIn, deadline, ...fields } = input;
  return {
    ...fields,
    ...(location && { city: location.city, state: location.state }),
    ...(walkIn !== undefined && { walkIn: walkIn ?? Prisma.DbNull }),
    ...(deadline !== undefined && { deadline: toDate(deadline) }),
  };
}

type RuleFields = Omit<JobRuleState, 'status'>;

/** A new job before anything is filled in (same defaults as the database). */
const NEW_JOB: RuleFields = {
  payMin: null,
  payMax: null,
  state: '',
  jobType: 'full_time',
  walkIn: null,
  deadline: null,
  allowCalls: false,
  hrPhone: null,
};

/** A field that was not sent keeps its current value; null means "cleared". */
const changed = <T>(value: T | undefined, current: T) => (value === undefined ? current : value);

/** The job as it will be after the changes, for checkJobRules. */
function afterChanges(current: RuleFields, status: string, changes: UpdateJobInput): JobRuleState {
  return {
    status,
    payMin: changed(changes.payMin, current.payMin),
    payMax: changed(changes.payMax, current.payMax),
    state: changed(changes.location?.state, current.state),
    jobType: changed(changes.jobType, current.jobType),
    walkIn: changed(changes.walkIn, current.walkIn),
    deadline: changes.deadline === undefined ? current.deadline : toDate(changes.deadline),
    allowCalls: changed(changes.allowCalls, current.allowCalls),
    hrPhone: changed(changes.hrPhone, current.hrPhone),
  };
}

async function findOwnJob(companyId: string, jobId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId }, include: { company: true } });
  if (!job) throw notFound('Job not found.');
  return job;
}

async function jobResponse(jobId: string) {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId }, include: { company: true } });
  const counts = await applicantCounts([job.id]);
  return toJobDto(job, counts(job.id));
}

export async function listEmployerJobs(companyId: string, status?: JobStatus) {
  const jobs = await prisma.job.findMany({
    where: { companyId, status },
    include: { company: true },
    orderBy: [{ postedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
  });
  const counts = await applicantCounts(jobs.map((job) => job.id));
  return jobs.map((job) => toJobDto(job, counts(job.id)));
}

export async function getEmployerJob(companyId: string, jobId: string) {
  const job = await findOwnJob(companyId, jobId);
  const counts = await applicantCounts([job.id]);
  return toJobDto(job, counts(job.id));
}

export async function createJob(companyId: string, userId: string, input: CreateJobInput) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw notFound('Company not found.');

  const status = input.status ?? 'draft';
  if (status === 'closed') throw invalid('A new job can be a draft or published.');
  if (status === 'active') ensureCanPublish(company);

  checkJobRules(afterChanges(NEW_JOB, status, input), true);

  const job = await prisma.job.create({
    data: {
      ...toJobData(input),
      // Repeated from toJobData so TypeScript knows a new job always has a city and state.
      city: input.location.city,
      state: input.location.state,
      companyId,
      createdById: userId,
      status,
      postedAt: status === 'active' ? new Date() : null,
    },
  });
  return jobResponse(job.id);
}

export async function updateJob(companyId: string, jobId: string, changes: UpdateJobInput) {
  const job = await findOwnJob(companyId, jobId);
  const nextStatus = changes.status ?? job.status;
  const publishing = nextStatus === 'active' && job.status !== 'active';

  if (publishing && job.removedByAdmin) {
    throw forbidden('This job was removed by IndustriaLink and cannot be published again.', 'REMOVED');
  }
  if (publishing) ensureCanPublish(job.company);

  if (nextStatus === 'draft' && job.status !== 'draft') {
    const applicants = await prisma.application.count({ where: { jobId } });
    if (applicants > 0) {
      throw conflict(
        'This job has applicants, so it cannot go back to draft. Close it instead.',
        'HAS_APPLICANTS',
      );
    }
  }

  checkJobRules(afterChanges(job, nextStatus, changes), publishing || changes.deadline !== undefined);

  await prisma.job.update({
    where: { id: job.id },
    data: { ...toJobData(changes), ...(publishing && !job.postedAt && { postedAt: new Date() }) },
  });
  return jobResponse(job.id);
}

/** Only jobs nobody applied to can be deleted; others are closed instead. */
export async function deleteJob(companyId: string, jobId: string) {
  const job = await findOwnJob(companyId, jobId);
  const applicants = await prisma.application.count({ where: { jobId: job.id } });
  if (applicants > 0) {
    throw conflict("This job has applicants, so it can't be deleted. Close it instead.", 'HAS_APPLICANTS');
  }
  await prisma.job.delete({ where: { id: job.id } });
}
