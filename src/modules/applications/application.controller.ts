import type { Request, Response } from 'express';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import { companyIdOf } from '../companies/company.service.js';
import {
  applySchema,
  candidateListSchema,
  interviewReplySchema,
  moveCandidateSchema,
  offerReplySchema,
} from './application.schemas.js';
import * as employer from './employer-applications.service.js';
import * as worker from './worker-applications.service.js';

// ── Worker ──

export async function apply(req: Request, res: Response) {
  const input = applySchema.parse(req.body ?? {});
  const jobId = parseId(req.params.id, 'Job');
  res.status(201).json(await worker.applyToJob(currentUser(req).id, jobId, input));
}

export async function listMine(req: Request, res: Response) {
  res.json(await worker.listWorkerApplications(currentUser(req).id));
}

export async function getMine(req: Request, res: Response) {
  res.json(await worker.getWorkerApplication(currentUser(req).id, parseId(req.params.id, 'Application')));
}

export async function withdraw(req: Request, res: Response) {
  res.json(await worker.withdrawApplication(currentUser(req).id, parseId(req.params.id, 'Application')));
}

export async function interviewReply(req: Request, res: Response) {
  const input = interviewReplySchema.parse(req.body ?? {});
  const id = parseId(req.params.id, 'Application');
  res.json(await worker.replyToInterview(currentUser(req).id, id, input));
}

export async function offerReply(req: Request, res: Response) {
  const input = offerReplySchema.parse(req.body ?? {});
  const id = parseId(req.params.id, 'Application');
  res.json(await worker.replyToOffer(currentUser(req).id, id, input));
}

// ── Employer ──

export async function jobCandidates(req: Request, res: Response) {
  const companyId = companyIdOf(currentUser(req));
  res.json(await employer.listJobCandidates(companyId, parseId(req.params.id, 'Job')));
}

export async function candidates(req: Request, res: Response) {
  const filters = candidateListSchema.parse(req.query);
  res.json(await employer.listCandidates(companyIdOf(currentUser(req)), filters));
}

export async function markViewed(req: Request, res: Response) {
  const user = currentUser(req);
  await employer.markViewed(companyIdOf(user), parseId(req.params.id, 'Candidate'), user.id);
  res.json({ ok: true });
}

export async function moveCandidate(req: Request, res: Response) {
  const user = currentUser(req);
  const input = moveCandidateSchema.parse(req.body ?? {});
  const id = parseId(req.params.id, 'Candidate');
  res.json(await employer.moveCandidate(companyIdOf(user), id, user.id, input));
}
