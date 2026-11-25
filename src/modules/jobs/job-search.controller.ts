import type { Request, Response } from 'express';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import { buildJobFeed } from './job-feed.service.js';
import * as search from './job-search.service.js';
import { jobSearchSchema } from './job.schemas.js';

// ── Worker ──

export async function searchJobs(req: Request, res: Response) {
  const params = jobSearchSchema.parse(req.query);
  res.json(await search.searchJobs(params, currentUser(req).id));
}

export async function getJob(req: Request, res: Response) {
  res.json(await search.getJobForWorker(parseId(req.params.id, 'Job'), currentUser(req).id));
}

export async function saveJob(req: Request, res: Response) {
  res.json(await search.saveJob(currentUser(req).id, parseId(req.params.id, 'Job')));
}

export async function unsaveJob(req: Request, res: Response) {
  res.json(await search.unsaveJob(currentUser(req).id, parseId(req.params.id, 'Job')));
}

export async function savedJobs(req: Request, res: Response) {
  res.json(await search.listSavedJobs(currentUser(req).id));
}

// ── Public (no login) ──

export async function searchPublicJobs(req: Request, res: Response) {
  res.json(await search.searchJobs(jobSearchSchema.parse(req.query), null));
}

export async function getPublicJob(req: Request, res: Response) {
  res.json(await search.getPublicJob(parseId(req.params.id, 'Job')));
}

/** Open to every site (public data), and cached for 5 minutes. */
export async function jobFeed(_req: Request, res: Response) {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' });
  res.json(await buildJobFeed());
}
