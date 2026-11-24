import { prisma } from '../../db/prisma.js';
import type { ApplicationStage, Prisma } from '../../generated/prisma/client.js';
import { todayInIndia } from '../../lib/dates.js';
import { conflict, invalid, notFound } from '../../lib/errors.js';
import { OPEN_STAGES } from '../messages/chat-access.js';
import { chatsChanged } from '../messages/chat-events.js';
import { candidateInclude, toCandidateDto } from './application.mapper.js';
import { notifyWorker } from './application.notify.js';
import type { CandidateListInput, MoveCandidateInput } from './application.schemas.js';

/** Most candidates one list returns. */
const LIST_LIMIT = 300;

async function findCompanyApplication(companyId: string, applicationId: string) {
  const app = await prisma.application.findFirst({
    where: { id: applicationId, job: { companyId } },
    include: {
      events: { where: { type: 'viewed' }, select: { id: true } },
      job: { select: { id: true, title: true, city: true, company: { select: { name: true } } } },
    },
  });
  if (!app) throw notFound('Candidate not found.');
  return app;
}

async function candidateResponse(applicationId: string) {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: candidateInclude,
  });
  return toCandidateDto(app);
}

/** Candidates of one job. Opening the list also clears the job's "new applicants" count. */
export async function listJobCandidates(companyId: string, jobId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId }, select: { id: true } });
  if (!job) throw notFound('Job not found.');

  await prisma.application.updateMany({ where: { jobId, seenAt: null }, data: { seenAt: new Date() } });
  const apps = await prisma.application.findMany({
    where: { jobId },
    include: candidateInclude,
    orderBy: { createdAt: 'desc' },
  });
  return apps.map(toCandidateDto);
}

/** Candidates across all the company's jobs, with search and filters. */
export async function listCandidates(companyId: string, filters: CandidateListInput) {
  const contains = (text: string) => ({ contains: text, mode: 'insensitive' as const });
  const where: Prisma.ApplicationWhereInput = {
    job: { companyId },
    stage: filters.stage,
    jobId: filters.jobId,
    ...(filters.q && {
      OR: [
        { worker: { user: { name: contains(filters.q) } } },
        { worker: { city: contains(filters.q) } },
        { worker: { trade: contains(filters.q) } },
        { worker: { skills: { has: filters.q } } },
        { job: { title: contains(filters.q) } },
      ],
    }),
  };
  const apps = await prisma.application.findMany({
    where,
    include: candidateInclude,
    orderBy: { updatedAt: 'desc' },
    take: LIST_LIMIT,
  });
  return apps.map(toCandidateDto);
}

/** HR opened the candidate. Adds "Seen by employer" to the worker's timeline, once. */
export async function markViewed(companyId: string, applicationId: string, userId: string) {
  const app = await findCompanyApplication(companyId, applicationId);
  if (app.events.length === 0) {
    await prisma.application.update({
      where: { id: app.id },
      data: {
        seenAt: app.seenAt ?? new Date(),
        events: { create: { type: 'viewed', byUserId: userId } },
      },
    });
  }
}

/** The message the worker gets when HR moves them to a stage. */
function stageMessage(stage: ApplicationStage, jobTitle: string, company: string, input: MoveCandidateInput) {
  switch (stage) {
    case 'shortlisted':
      return `You were shortlisted for ${jobTitle}.`;
    case 'interview':
      return `${company} invited you for an interview for ${jobTitle}.`;
    case 'offer': {
      const pay = input.offer!.pay.toLocaleString('en-IN');
      return `${company} offered you ${jobTitle} at ₹${pay}/${input.offer!.payPeriod}. Please reply.`;
    }
    case 'hired':
      return `You are hired for ${jobTitle}. Congratulations!`;
    case 'rejected':
      return input.notify ? `${company} did not select you this time for ${jobTitle}.` : null;
    default:
      return null;
  }
}

/**
 * HR moves a candidate: shortlisted → interview → offer → hired, or rejected.
 * Sending the interview or offer again while already in that stage updates it
 * (the worker is told and must reply again).
 */
export async function moveCandidate(
  companyId: string,
  applicationId: string,
  userId: string,
  input: MoveCandidateInput,
) {
  const app = await findCompanyApplication(companyId, applicationId);
  if (app.stage === 'withdrawn') {
    throw conflict('This candidate withdrew their application.', 'WITHDRAWN');
  }

  const { job } = app;
  const company = job.company.name;
  const stageChanges = input.stage !== app.stage;
  const updates: Prisma.ApplicationUpdateInput = {};
  const messages: { title: string; body: string }[] = [];

  if (input.stage === 'interview' && input.interview) {
    const at = new Date(input.interview.at);
    if (at <= new Date()) throw invalid('Choose an interview time in the future.');
    const details = {
      at,
      place: input.interview.place ?? job.city,
      contactPerson: input.interview.contactPerson ?? null,
      bring: input.interview.bring ?? null,
      // A new time needs a new reply from the worker.
      response: null,
      responseNote: null,
      respondedAt: null,
    };
    updates.interview = { upsert: { create: details, update: details } };
    if (!stageChanges) {
      messages.push({
        title: 'Interview time changed',
        body: `${company} moved your ${job.title} interview. Please check the new time.`,
      });
    }
  }

  if (input.stage === 'offer' && input.offer) {
    const joiningDate = new Date(input.offer.joiningDate);
    if (joiningDate < todayInIndia()) throw invalid('Choose a joining date from today onwards.');
    const details = {
      ...input.offer,
      payType: input.offer.payType ?? null,
      note: input.offer.note ?? null,
      joiningDate,
      sentAt: new Date(),
    };
    updates.offer = { upsert: { create: details, update: details } };
    updates.offerResponse = null;
    if (!stageChanges) {
      messages.push({
        title: 'Offer updated',
        body: `${company} changed your offer for ${job.title}. Please check it again.`,
      });
    }
  }

  if (stageChanges) {
    const rejected = input.stage === 'rejected';
    const now = Date.now();
    const events: Prisma.ApplicationEventCreateWithoutApplicationInput[] = [];
    // Any decision means HR has looked at the profile. (1 ms earlier, so the timeline order is right.)
    if (app.events.length === 0) {
      events.push({ type: 'viewed', createdAt: new Date(now - 1), byUser: { connect: { id: userId } } });
    }
    events.push({
      type: input.stage,
      createdAt: new Date(now),
      note: input.note ?? null,
      isPrivate: rejected,
      byUser: { connect: { id: userId } },
    });

    Object.assign(updates, {
      stage: input.stage,
      seenAt: app.seenAt ?? new Date(),
      rejectionNote: rejected ? (input.note ?? null) : null,
      events: { create: events },
    });

    // From shortlisting on, the worker and HR can chat. The chat is made once and kept,
    // also if the worker is rejected later (it becomes read-only then).
    if (OPEN_STAGES.includes(input.stage)) {
      updates.conversation = {
        upsert: { create: { workerId: app.workerId, companyId }, update: {} },
      };
    }

    const body = stageMessage(input.stage, job.title, company, input);
    if (body) messages.push({ title: 'Application update', body });
  }

  if (Object.keys(updates).length > 0) {
    await prisma.application.update({ where: { id: app.id }, data: { ...updates, updatedAt: new Date() } });
  }
  if (stageChanges) chatsChanged({ applicationId: app.id });
  for (const message of messages) {
    await notifyWorker(app.workerId, app.id, message.title, message.body);
  }
  return candidateResponse(app.id);
}
