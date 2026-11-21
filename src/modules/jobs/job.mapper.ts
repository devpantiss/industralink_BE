import type { Company, Job } from '../../generated/prisma/client.js';
import { toDateOnly } from '../../lib/dates.js';
import { toNationalPhone } from '../../lib/phone.js';
import { optionalFileUrl } from '../files/storage.js';

export type JobWithCompany = Job & { company: Company };

export interface ApplicantCounts {
  applicantsCount: number;
  newApplicantsCount: number;
}

const orUndefined = <T>(value: T | null) => value ?? undefined;

/** The job as the employer and admin see it (matches `Job` in the dashboard types). */
export function toJobDto(job: JobWithCompany, counts: ApplicantCounts) {
  return {
    id: job.id,
    companyId: job.companyId,
    companyName: job.company.name,
    companyVerified: job.company.verification === 'approved',
    companyLogoUrl: optionalFileUrl(job.company.logoKey, 24 * 60),
    title: job.title,
    trade: job.trade,
    sector: job.sector,
    location: { city: job.city, state: job.state },
    payMin: orUndefined(job.payMin),
    payMax: orUndefined(job.payMax),
    payPeriod: job.payPeriod,
    payType: orUndefined(job.payType),
    shift: job.shift,
    workHours: orUndefined(job.workHours),
    jobType: job.jobType,
    contractLength: orUndefined(job.contractLength),
    walkIn: (job.walkIn ?? undefined) as Record<string, string> | undefined,
    openings: job.openings,
    experience: job.experience,
    qualifications: job.qualifications,
    licences: job.licences,
    benefits: job.benefits,
    responsibilities: job.responsibilities,
    requirements: job.requirements,
    status: job.status,
    /** Drafts were never posted; the apps still expect a date, so the creation date is used. */
    postedAt: (job.postedAt ?? job.createdAt).toISOString(),
    deadline: toDateOnly(job.deadline),
    siteName: orUndefined(job.siteName),
    address: orUndefined(job.address),
    pincode: orUndefined(job.pincode),
    hrPhone: toNationalPhone(job.hrPhone),
    allowCalls: job.allowCalls,
    callHours: orUndefined(job.callHours),
    removedByAdmin: job.removedByAdmin || undefined,
    applicantsCount: counts.applicantsCount,
    newApplicantsCount: counts.newApplicantsCount,
  };
}

/** The job without private fields: the HR number is never sent to workers or the public. */
export function toPublicJobDto(job: JobWithCompany, counts: ApplicantCounts) {
  const { hrPhone: _private, ...rest } = toJobDto(job, counts);
  return rest;
}

/** The job as a logged-in worker sees it (matches `JobForWorker`). */
export function toWorkerJobDto(
  job: JobWithCompany,
  counts: ApplicantCounts,
  extras: { saved: boolean; appliedApplicationId?: string },
) {
  return { ...toPublicJobDto(job, counts), ...extras };
}
