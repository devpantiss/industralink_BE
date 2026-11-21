import type { Company } from '../../generated/prisma/client.js';
import { todayInIndia } from '../../lib/dates.js';
import { AppError, forbidden } from '../../lib/errors.js';

const invalid = (message: string) => new AppError(422, 'VALIDATION_ERROR', message);

/** The job as it will be after the change: only the fields the rules look at. */
export interface JobRuleState {
  status: string;
  payMin: number | null;
  payMax: number | null;
  state: string;
  jobType: string;
  walkIn: unknown;
  deadline: Date | null;
  allowCalls: boolean;
  hrPhone: string | null;
}

/**
 * Rules that need more than one field. `checkDeadline` is on when the job is being
 * published or its last date is changed (an old active job may already be past its date).
 */
export function checkJobRules(job: JobRuleState, checkDeadline: boolean) {
  if (job.payMin !== null && job.payMax !== null && job.payMin > job.payMax) {
    throw invalid('Minimum pay must not be more than maximum pay.');
  }
  if (job.allowCalls && !job.hrPhone) {
    throw invalid('Add the HR number to let shortlisted workers call.');
  }
  if (job.status !== 'active') return;

  if (job.payMin === null && job.payMax === null) throw invalid('Add a pay range before publishing.');
  if (!job.state) throw invalid('Add the state of the work site before publishing.');
  if (job.jobType === 'walk_in' && !job.walkIn) {
    throw invalid('Add the walk-in date, time and address before publishing.');
  }
  if (checkDeadline && job.deadline && job.deadline < todayInIndia()) {
    throw invalid('The last date to apply has already passed. Pick a later date.');
  }
}

/** Only admin-approved, non-blocked companies can show jobs to workers. */
export function ensureCanPublish(company: Pick<Company, 'verification' | 'status'>) {
  if (company.status === 'blocked') {
    throw forbidden('This company account is blocked, so it cannot publish jobs.', 'BLOCKED');
  }
  if (company.verification !== 'approved') {
    throw forbidden(
      'You can publish jobs after your company is verified. Save it as a draft for now.',
      'NOT_VERIFIED',
    );
  }
}
