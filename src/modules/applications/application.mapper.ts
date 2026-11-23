import type {
  Application,
  ApplicationEvent,
  Interview,
  Offer,
  User,
  WorkerDocument,
  WorkerProfile,
  WorkHistory,
} from '../../generated/prisma/client.js';
import { toDateOnly } from '../../lib/dates.js';
import { toNationalPhone } from '../../lib/phone.js';
import { type ApplicantCounts, type JobWithCompany, toPublicJobDto } from '../jobs/job.mapper.js';
import { toWorkerDocumentDto, toWorkerProfileDto } from '../workers/worker.mapper.js';

/** What every application query loads: the timeline, interview and offer. */
export const applicationInclude = {
  events: { orderBy: { createdAt: 'asc' } },
  interview: true,
  offer: true,
} as const;

/** For the worker's screens: plus the job and its company. */
export const workerApplicationInclude = {
  ...applicationInclude,
  job: { include: { company: true } },
} as const;

/** For HR's screens: plus the worker's full profile and documents. */
export const candidateInclude = {
  ...applicationInclude,
  job: { select: { title: true } },
  worker: {
    include: {
      user: true,
      workHistory: { orderBy: { sortOrder: 'asc' } },
      documents: { orderBy: { createdAt: 'desc' } },
    },
  },
} as const;

type ApplicationRecord = Application & {
  events: ApplicationEvent[];
  interview: Interview | null;
  offer: Offer | null;
};

export type WorkerApplicationRecord = ApplicationRecord & { job: JobWithCompany };

export type CandidateRecord = ApplicationRecord & {
  job: { title: string };
  worker: WorkerProfile & { user: User; workHistory: WorkHistory[]; documents: WorkerDocument[] };
};

/** From this stage on, the worker may see the HR phone (if the job allows calls). */
const CONTACT_STAGES = ['shortlisted', 'interview', 'offer', 'hired'];

const orUndefined = <T>(value: T | null) => value ?? undefined;

function toInterviewDto(interview: Interview | null) {
  if (!interview) return undefined;
  return {
    at: interview.at.toISOString(),
    place: interview.place,
    contactPerson: orUndefined(interview.contactPerson),
    bring: orUndefined(interview.bring),
    response: orUndefined(interview.response),
    responseNote: orUndefined(interview.responseNote),
    respondedAt: interview.respondedAt?.toISOString(),
  };
}

function toOfferDto(offer: Offer | null) {
  if (!offer) return undefined;
  return {
    pay: offer.pay,
    payPeriod: offer.payPeriod,
    payType: orUndefined(offer.payType),
    joiningDate: toDateOnly(offer.joiningDate),
    place: offer.place,
    note: orUndefined(offer.note),
    sentAt: offer.sentAt.toISOString(),
  };
}

/** The fields both sides see (matches `Application` in the dashboard types). */
function toApplicationDto(app: ApplicationRecord, forWorker: boolean) {
  return {
    id: app.id,
    jobId: app.jobId,
    workerId: app.workerId,
    stage: app.stage,
    appliedAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    timeline: app.events.map((event) => ({
      stage: event.type,
      at: event.createdAt.toISOString(),
      // Private notes (e.g. the "not suitable" reason) are for HR only.
      note: forWorker && event.isPrivate ? undefined : orUndefined(event.note),
    })),
    interview: toInterviewDto(app.interview),
    sentWith: app.sentWith,
    documentId: orUndefined(app.documentId),
    rejectionNote: forWorker ? undefined : orUndefined(app.rejectionNote),
    offer: toOfferDto(app.offer),
    offerResponse: orUndefined(app.offerResponse),
  };
}

/** The application as the worker sees it (matches `WorkerApplication`). */
export function toWorkerApplicationDto(app: WorkerApplicationRecord, counts: ApplicantCounts) {
  const { job } = app;
  const canCall = job.allowCalls && !!job.hrPhone && CONTACT_STAGES.includes(app.stage);
  return {
    ...toApplicationDto(app, true),
    job: toPublicJobDto(job, counts),
    contact: canCall
      ? { phone: toNationalPhone(job.hrPhone)!, hours: orUndefined(job.callHours) }
      : undefined,
  };
}

/** The application as HR sees it (matches `Candidate`). The document sent with it comes first. */
export function toCandidateDto(app: CandidateRecord) {
  const documents = [...app.worker.documents].sort(
    (a, b) => Number(b.id === app.documentId) - Number(a.id === app.documentId),
  );
  return {
    ...toApplicationDto(app, false),
    worker: toWorkerProfileDto(app.worker),
    jobTitle: app.job.title,
    documents: documents.map(toWorkerDocumentDto),
  };
}
