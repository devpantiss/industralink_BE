import { Router } from 'express';
import * as employerJobs from './employer-jobs.controller.js';
import * as jobs from './job-search.controller.js';

/** Mounted at /api/v1/jobs (workers only, see routes.ts). */
export const workerJobsRouter = Router();
workerJobsRouter.get('/', jobs.searchJobs);
workerJobsRouter.get('/:id', jobs.getJob);
workerJobsRouter.post('/:id/save', jobs.saveJob);
workerJobsRouter.delete('/:id/save', jobs.unsaveJob);

/** Mounted at /api/v1/worker/saved (workers only). */
export const savedJobsRouter = Router();
savedJobsRouter.get('/', jobs.savedJobs);

/** Mounted at /api/v1/public/jobs (no login). */
export const publicJobsRouter = Router();
publicJobsRouter.get('/', jobs.searchPublicJobs);
publicJobsRouter.get('/:id', jobs.getPublicJob);

/** Mounted at /api/v1/public/feed (no login): the landing site's job feed. */
export const publicFeedRouter = Router();
publicFeedRouter.get('/', jobs.jobFeed);

/** Mounted at /api/v1/employer/jobs (employers only). */
export const employerJobsRouter = Router();
employerJobsRouter.get('/', employerJobs.list);
employerJobsRouter.post('/', employerJobs.create);
employerJobsRouter.get('/:id', employerJobs.get);
employerJobsRouter.patch('/:id', employerJobs.update);
employerJobsRouter.delete('/:id', employerJobs.remove);
