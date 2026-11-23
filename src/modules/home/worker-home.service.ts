import { prisma } from '../../db/prisma.js';
import { profileCompleteness } from '../workers/profile-completeness.js';

/** Stages where the worker is still waiting for a result. */
const ACTIVE_STAGES = ['applied', 'shortlisted', 'interview', 'offer'] as const;

/** What the worker should do next: an upcoming interview first, then an offer waiting for a reply. */
async function nextStep(workerId: string) {
  const interview = await prisma.interview.findFirst({
    where: { at: { gt: new Date() }, application: { workerId, stage: 'interview' } },
    orderBy: { at: 'asc' },
    include: { application: { include: { job: { include: { company: { select: { name: true } } } } } } },
  });
  if (interview) {
    const { job } = interview.application;
    return {
      title: 'Interview',
      subtitle: `${job.title} · ${job.company.name} · ${job.city}`,
      link: `/worker/applications/${interview.applicationId}`,
      at: interview.at.toISOString(),
    };
  }

  const offer = await prisma.application.findFirst({
    where: { workerId, stage: 'offer', offerResponse: null },
    orderBy: { updatedAt: 'desc' },
    include: { job: { include: { company: { select: { name: true } } } } },
  });
  if (offer) {
    return {
      title: 'Reply to your offer',
      subtitle: `${offer.job.title} · ${offer.job.company.name}`,
      link: `/worker/applications/${offer.id}`,
    };
  }
  return undefined;
}

/** Worker home screen (matches `WorkerSummary`). */
export async function workerSummary(workerId: string) {
  const [profile, documents, activeApplications, interviews, saved, next] = await Promise.all([
    prisma.workerProfile.upsert({ where: { userId: workerId }, create: { userId: workerId }, update: {} }),
    prisma.workerDocument.findMany({ where: { workerId }, select: { type: true } }),
    prisma.application.count({ where: { workerId, stage: { in: [...ACTIVE_STAGES] } } }),
    prisma.application.count({ where: { workerId, stage: 'interview' } }),
    prisma.savedJob.count({ where: { workerId } }),
    nextStep(workerId),
  ]);

  const { score, missing } = profileCompleteness(
    profile,
    documents.map((doc) => doc.type),
  );
  return {
    activeApplications,
    interviews,
    saved,
    profileStrength: score,
    profileHint: missing[0]?.label,
    missing,
    nextStep: next,
  };
}
