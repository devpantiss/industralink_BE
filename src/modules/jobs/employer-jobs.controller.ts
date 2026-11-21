import type { Request, Response } from 'express';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import { companyIdOf } from '../companies/company.service.js';
import * as jobs from './employer-jobs.service.js';
import { createJobSchema, employerJobListSchema, updateJobSchema } from './job.schemas.js';

export async function list(req: Request, res: Response) {
  const { status } = employerJobListSchema.parse(req.query);
  res.json(await jobs.listEmployerJobs(companyIdOf(currentUser(req)), status));
}

export async function get(req: Request, res: Response) {
  res.json(await jobs.getEmployerJob(companyIdOf(currentUser(req)), parseId(req.params.id, 'Job')));
}

export async function create(req: Request, res: Response) {
  const user = currentUser(req);
  const input = createJobSchema.parse(req.body ?? {});
  res.status(201).json(await jobs.createJob(companyIdOf(user), user.id, input));
}

export async function update(req: Request, res: Response) {
  const changes = updateJobSchema.parse(req.body ?? {});
  res.json(await jobs.updateJob(companyIdOf(currentUser(req)), parseId(req.params.id, 'Job'), changes));
}

export async function remove(req: Request, res: Response) {
  await jobs.deleteJob(companyIdOf(currentUser(req)), parseId(req.params.id, 'Job'));
  res.json({ ok: true });
}
