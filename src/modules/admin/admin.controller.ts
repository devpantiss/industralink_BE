import type { Request, Response } from 'express';
import { notFound } from '../../lib/errors.js';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
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
