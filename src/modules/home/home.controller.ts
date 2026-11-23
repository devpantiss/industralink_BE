import type { Request, Response } from 'express';
import { currentUser } from '../../middleware/auth.js';
import { companyIdOf } from '../companies/company.service.js';
import { adminSummary } from './admin-home.service.js';
import { employerSummary } from './employer-home.service.js';
import { workerSummary } from './worker-home.service.js';

export async function workerHome(req: Request, res: Response) {
  res.json(await workerSummary(currentUser(req).id));
}

export async function employerHome(req: Request, res: Response) {
  res.json(await employerSummary(companyIdOf(currentUser(req))));
}

export async function adminHome(_req: Request, res: Response) {
  res.json(await adminSummary());
}
