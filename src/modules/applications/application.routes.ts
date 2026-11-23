import { Router } from 'express';
import * as applications from './application.controller.js';

/** Mounted at /api/v1/jobs next to the job search (workers only, see routes.ts). */
export const applyRouter = Router();
applyRouter.post('/:id/apply', applications.apply);

/** Mounted at /api/v1/worker/applications (workers only). */
export const workerApplicationsRouter = Router();
workerApplicationsRouter.get('/', applications.listMine);
workerApplicationsRouter.get('/:id', applications.getMine);
workerApplicationsRouter.post('/:id/withdraw', applications.withdraw);
workerApplicationsRouter.post('/:id/interview-response', applications.interviewReply);
workerApplicationsRouter.post('/:id/offer-response', applications.offerReply);

/** Mounted at /api/v1/employer/jobs next to the job routes (employers only). */
export const jobCandidatesRouter = Router();
jobCandidatesRouter.get('/:id/candidates', applications.jobCandidates);

/** Mounted at /api/v1/employer/candidates (employers only). */
export const candidatesRouter = Router();
candidatesRouter.get('/', applications.candidates);

/** Mounted at /api/v1/employer/applications (employers only). */
export const employerApplicationsRouter = Router();
employerApplicationsRouter.patch('/:id', applications.moveCandidate);
employerApplicationsRouter.post('/:id/view', applications.markViewed);
