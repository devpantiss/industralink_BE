import { Router } from 'express';
import * as admin from './admin.controller.js';

/** Mounted at /api/v1/admin/verifications (admins only, see routes.ts). */
export const verificationRouter = Router();

verificationRouter.get('/', admin.listVerifications);
verificationRouter.post('/:kind/:id', admin.decideVerification);

/** Mounted at /api/v1/admin/jobs (admins only). */
export const adminJobsRouter = Router();

adminJobsRouter.get('/', admin.listJobs);
adminJobsRouter.post('/:id/remove', admin.removeJob);

/** Mounted at /api/v1/admin/users (admins only). The user list comes in a later phase. */
export const adminUsersRouter = Router();

adminUsersRouter.patch('/:id', admin.setStatus);
