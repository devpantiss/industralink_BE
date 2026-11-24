import type { Request, Response } from 'express';
import { notFound } from '../../lib/errors.js';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import { setUserStatus } from '../users/user.service.js';
import { toUserDto } from '../users/user.mapper.js';
import { recordAudit } from './audit.service.js';
import * as adminJobs from './admin-jobs.service.js';
import * as adminUsers from './admin-users.service.js';
import { listActivity } from './activity-log.service.js';
import * as platform from './platform-settings.service.js';
import {
  adminJobListSchema,
  decideVerificationSchema,
  listVerificationsSchema,
  platformSettingsSchema,
  removeJobSchema,
  userListSchema,
  userStatusSchema,
} from './admin.schemas.js';
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

/** Block or unblock a worker or employer. Blocking logs them out everywhere. */
export async function setStatus(req: Request, res: Response) {
  const { status, reason } = userStatusSchema.parse(req.body ?? {});
  const admin = currentUser(req);
  const user = await setUserStatus(parseId(req.params.id, 'User'), status);
  await recordAudit({
    actorId: admin.id,
    action: status === 'blocked' ? 'user.block' : 'user.unblock',
    targetType: 'user',
    targetId: user.id,
    ...(reason && { details: { reason } }),
  });
  res.json(toUserDto(user));
}

export async function listUsers(req: Request, res: Response) {
  res.json(await adminUsers.listUsers(userListSchema.parse(req.query)));
}

export async function userImpact(req: Request, res: Response) {
  res.json(await adminUsers.userImpact(parseId(req.params.id, 'User')));
}

export async function activityLog(_req: Request, res: Response) {
  res.json(await listActivity());
}

export async function getSettings(_req: Request, res: Response) {
  res.json(await platform.getPlatformSettings());
}

export async function updateSettings(req: Request, res: Response) {
  const changes = platformSettingsSchema.parse(req.body ?? {});
  res.json(await platform.updatePlatformSettings(currentUser(req).id, changes));
}
