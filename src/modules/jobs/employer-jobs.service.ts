import { prisma } from '../../db/prisma.js';
import { Prisma, type JobStatus } from '../../generated/prisma/client.js';
import { AppError, forbidden, notFound } from '../../lib/errors.js';
import { toJobDto } from './job.mapper.js';
import { applicantCounts } from './job.queries.js';
import { checkJobRules, ensureCanPublish } from './job.rules.js';
import type { CreateJobInput, UpdateJobInput } from './job.schemas.js';

/** Form fields -> database columns. Fields that were not sent stay undefined (= unchanged). */
function toJobData<T extends UpdateJobInput>(input: T) {
  const { location, walkIn, deadline, ...fields } = input;
  return {
    ...fields,
    ...(location && { city: location.city, state: location.state }),
    ...(walkIn !== undefined && { walkIn: walkIn ?? Prisma.DbNull }),
    ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
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
  if (status === 'closed')
    throw new AppError(422, 'VALIDATION_ERROR', 'A new job can be a draft or published.');
  if (status === 'active') ensureCanPublish(company);

  checkJobRules(
    {
      status,
      payMin: input.payMin ?? null,
      payMax: input.payMax ?? null,
      state: input.location.state,
      jobType: input.jobType ?? 'full_time',
      walkIn: input.walkIn ?? null,
      deadline: input.deadline ? new Date(input.deadline) : null,
      allowCalls: input.allowCalls ?? false,
      hrPhone: input.hrPhone ?? null,
    },
    true,
  );

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
      throw new AppError(
        409,
        'HAS_APPLICANTS',
        'This job has applicants, so it cannot go back to draft. Close it instead.',
      );
    }
  }

  const data = toJobData(changes);
  checkJobRules(
    {
      status: nextStatus,
      payMin: changes.payMin !== undefined ? changes.payMin : job.payMin,
      payMax: changes.payMax !== undefined ? changes.payMax : job.payMax,
      state: changes.location?.state ?? job.state,
      jobType: changes.jobType ?? job.jobType,
      walkIn: changes.walkIn !== undefined ? changes.walkIn : job.walkIn,
      deadline: data.deadline !== undefined ? data.deadline : job.deadline,
      allowCalls: changes.allowCalls ?? job.allowCalls,
      hrPhone: changes.hrPhone !== undefined ? changes.hrPhone : job.hrPhone,
    },
    publishing || changes.deadline !== undefined,
  );

  await prisma.job.update({
    where: { id: job.id },
    data: { ...data, ...(publishing && !job.postedAt && { postedAt: new Date() }) },
  });
  return jobResponse(job.id);
}

/** Only jobs nobody applied to can be deleted; others are closed instead. */
export async function deleteJob(companyId: string, jobId: string) {
  const job = await findOwnJob(companyId, jobId);
  const applicants = await prisma.application.count({ where: { jobId: job.id } });
  if (applicants > 0) {
    throw new AppError(
      409,
      'HAS_APPLICANTS',
      "This job has applicants, so it can't be deleted. Close it instead.",
    );
  }
  await prisma.job.delete({ where: { id: job.id } });
}
