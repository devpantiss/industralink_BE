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

/** Mounted at /api/v1/admin/users (admins only). */
export const adminUsersRouter = Router();

adminUsersRouter.get('/', admin.listUsers);
adminUsersRouter.patch('/:id', admin.setStatus);

/** Mounted at /api/v1/admin/user-impact (admins only). */
export const userImpactRouter = Router();

userImpactRouter.get('/:id', admin.userImpact);
