import type { Request, Response } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import { adminJobListSchema, removeJobSchema } from '../jobs/job.schemas.js';
import { setUserStatus } from '../users/user.service.js';
import { toUserDto } from '../users/user.mapper.js';
import { recordAudit } from './audit.service.js';
import * as adminJobs from './admin-jobs.service.js';
import { decideVerificationSchema, listVerificationsSchema } from './verification.schemas.js';
import * as verifications from './verification.service.js';

export async function listVerifications(req: Request, res: Response) {
  const { status } = listVerificationsSchema.parse(req.query);
  res.json(await verifications.listCompanyVerifications(status));
}

export async function decideVerification(req: Request, res: Response) {
  // Only companies are verified (workers' documents are not).
  if (req.params.kind !== 'company') throw notFound();
  const input = decideVerificationSchema.parse(req.body ?? {});
  await verifications.decideCompany(currentUser(req).id, parseId(req.params.id, 'Company'), input);
  res.json({ ok: true });
}

export async function listJobs(req: Request, res: Response) {
  res.json(await adminJobs.listJobsForAdmin(adminJobListSchema.parse(req.query)));
}

export async function removeJob(req: Request, res: Response) {
  const { reason } = removeJobSchema.parse(req.body ?? {});
  await adminJobs.removeJob(currentUser(req).id, parseId(req.params.id, 'Job'), reason);
  res.json({ ok: true });
}

const userStatusSchema = z.object({ status: z.enum(['active', 'blocked'], 'Choose active or blocked.') });

/** Block or unblock a worker or employer. Blocking logs them out everywhere. */
export async function setStatus(req: Request, res: Response) {
  const { status } = userStatusSchema.parse(req.body ?? {});
  const admin = currentUser(req);
  const user = await setUserStatus(parseId(req.params.id, 'User'), status);
  await recordAudit({
    actorId: admin.id,
    action: status === 'blocked' ? 'user.block' : 'user.unblock',
    targetType: 'user',
    targetId: user.id,
  });
  res.json(toUserDto(user));
}
