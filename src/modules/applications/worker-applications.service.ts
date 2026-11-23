import { prisma } from '../../db/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError, conflict, invalid, notFound } from '../../lib/errors.js';
import { applicantCounts, openJobWhere, viewableJobWhere } from '../jobs/job.queries.js';
import { toWorkerApplicationDto, workerApplicationInclude } from './application.mapper.js';
import { notifyCompanyHr } from './application.notify.js';
import type { ApplyInput, InterviewReplyInput, OfferReplyInput } from './application.schemas.js';

const CLOSED_STAGES = ['hired', 'rejected', 'withdrawn'];

async function findOwnApplication(workerId: string, applicationId: string) {
  const app = await prisma.application.findFirst({
    where: { id: applicationId, workerId },
    include: workerApplicationInclude,
  });
  if (!app) throw notFound('Application not found.');
  return app;
}

async function applicationResponse(applicationId: string) {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: workerApplicationInclude,
  });
  const counts = await applicantCounts([app.jobId]);
  return toWorkerApplicationDto(app, counts(app.jobId));
}

export async function applyToJob(workerId: string, jobId: string, input: ApplyInput) {
  const job = await prisma.job.findFirst({ where: { id: jobId, ...viewableJobWhere } });
  if (!job) throw notFound("This job was removed or doesn't exist.");

  const isOpen = await prisma.job.count({ where: { id: jobId, ...openJobWhere() } });
  if (!isOpen) throw new AppError(410, 'JOB_CLOSED', 'This job is no longer accepting applications.');

  const existing = await prisma.application.findUnique({
    where: { jobId_workerId: { jobId, workerId } },
    select: { stage: true },
  });
  if (existing?.stage === 'withdrawn') {
    throw conflict("You withdrew from this job earlier, so you can't apply again.", 'WITHDRAWN');
  }
  if (existing) throw conflict('You have already applied to this job.', 'ALREADY_APPLIED');

  let documentId: string | null = null;
  if (input.sentWith === 'document') {
    const doc = input.documentId
      ? await prisma.workerDocument.findFirst({
          where: { id: input.documentId, workerId },
          select: { id: true },
        })
      : null;
    if (!doc) throw invalid('Choose a resume to send.', 'NO_DOCUMENT');
    documentId = doc.id;
  }

  const app = await prisma.application
    .create({
      data: {
        jobId,
        workerId,
        sentWith: input.sentWith,
        documentId,
        events: { create: { type: 'applied', byUserId: workerId } },
      },
      include: { worker: { select: { user: { select: { name: true } } } } },
    })
    .catch((error: unknown) => {
      // Two taps at the same time: the second one hits the "one application per job" rule.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('You have already applied to this job.', 'ALREADY_APPLIED');
      }
      throw error;
    });

  await notifyCompanyHr(job.companyId, {
    title: 'New applicant',
    body: `${app.worker.user.name} applied for ${job.title}.`,
    link: `/employer/jobs/${job.id}`,
  });
  return applicationResponse(app.id);
}

export async function listWorkerApplications(workerId: string) {
  const apps = await prisma.application.findMany({
    where: { workerId },
    include: workerApplicationInclude,
    orderBy: { updatedAt: 'desc' },
  });
  const counts = await applicantCounts([...new Set(apps.map((app) => app.jobId))]);
  return apps.map((app) => toWorkerApplicationDto(app, counts(app.jobId)));
}

export async function getWorkerApplication(workerId: string, applicationId: string) {
  const app = await findOwnApplication(workerId, applicationId);
  const counts = await applicantCounts([app.jobId]);
  return toWorkerApplicationDto(app, counts(app.jobId));
}

export async function withdrawApplication(workerId: string, applicationId: string) {
  const app = await findOwnApplication(workerId, applicationId);
  if (CLOSED_STAGES.includes(app.stage)) throw conflict('This application is already closed.', 'CLOSED');

  await prisma.application.update({
    where: { id: app.id },
    data: { stage: 'withdrawn', events: { create: { type: 'withdrawn', byUserId: workerId } } },
  });
  await notifyCompanyHr(app.job.companyId, {
    title: 'Application withdrawn',
    body: `A candidate withdrew their application for ${app.job.title}.`,
    link: `/employer/jobs/${app.jobId}`,
  });
  return applicationResponse(app.id);
}

export async function replyToInterview(workerId: string, applicationId: string, input: InterviewReplyInput) {
  const app = await findOwnApplication(workerId, applicationId);
  if (app.stage !== 'interview' || !app.interview) {
    throw conflict('There is no interview to reply to.', 'NO_INTERVIEW');
  }

  const note = input.note ?? null;
  await prisma.application.update({
    where: { id: app.id },
    data: {
      updatedAt: new Date(),
      interview: { update: { response: input.response, responseNote: note, respondedAt: new Date() } },
    },
  });

  const worker = await prisma.user.findUniqueOrThrow({ where: { id: workerId }, select: { name: true } });
  const attending = input.response === 'attending';
  await notifyCompanyHr(app.job.companyId, {
    title: attending ? 'Interview confirmed' : "Candidate can't attend",
    body: attending
      ? `${worker.name} will attend the interview for ${app.job.title}.`
      : `${worker.name} can't attend the interview for ${app.job.title}${note ? `: "${note}"` : '.'} Please pick a new time.`,
    link: `/employer/jobs/${app.jobId}`,
  });
  return applicationResponse(app.id);
}

export async function replyToOffer(workerId: string, applicationId: string, input: OfferReplyInput) {
  const app = await findOwnApplication(workerId, applicationId);
  if (app.stage !== 'offer' || !app.offer) throw conflict('There is no offer to reply to.', 'NO_OFFER');

  const accepted = input.response === 'accepted';
  const note = input.note ? `Declined the offer: ${input.note}` : 'Declined the offer';
  await prisma.application.update({
    where: { id: app.id },
    data: {
      offerResponse: input.response,
      // Declining closes the application.
      ...(!accepted && { stage: 'withdrawn' }),
      events: {
        create: accepted
          ? { type: 'offer', note: 'Accepted the offer', byUserId: workerId }
          : { type: 'withdrawn', note, byUserId: workerId },
      },
    },
  });

  const worker = await prisma.user.findUniqueOrThrow({ where: { id: workerId }, select: { name: true } });
  await notifyCompanyHr(app.job.companyId, {
    title: accepted ? 'Offer accepted' : 'Offer declined',
    body: accepted
      ? `${worker.name} accepted your offer for ${app.job.title}. Mark them hired once they join.`
      : `${worker.name} declined your offer for ${app.job.title}.`,
    link: `/employer/jobs/${app.jobId}`,
  });
  return applicationResponse(app.id);
}
