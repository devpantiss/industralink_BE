import { Router } from 'express';
import { requireAuth, requireRole } from './middleware/auth.js';
import { accountRouter } from './modules/account/account.routes.js';
import { adminJobsRouter, verificationRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { companyDirectoryRouter } from './modules/companies/company-directory.routes.js';
import { companyRouter } from './modules/companies/company.routes.js';
import {
  employerJobsRouter,
  publicJobsRouter,
  savedJobsRouter,
  workerJobsRouter,
} from './modules/jobs/jobs.routes.js';
import { workerProfileRouter } from './modules/workers/worker.routes.js';

/**
 * Every API module is mounted here, under /api/v1.
 * Who may call what is decided in this one file: each area below has its own guard.
 */
export const apiRouter = Router();

// Login and the current user. Each route sets its own rule.
apiRouter.use('/auth', authRouter);

// Public pages (no login): shared job links and the landing site.
apiRouter.use('/public/jobs', publicJobsRouter);

// Any logged-in user.
const me = Router();
me.use(requireAuth);
me.use('/', accountRouter);
apiRouter.use('/me', me);

// Workers.
const worker = Router();
worker.use(requireAuth, requireRole('worker'));
worker.use('/', workerProfileRouter);
worker.use('/saved', savedJobsRouter);
apiRouter.use('/worker', worker);

// Workers: finding jobs and companies.
const workerOnly = [requireAuth, requireRole('worker')];
apiRouter.use('/jobs', ...workerOnly, workerJobsRouter);
apiRouter.use('/companies', ...workerOnly, companyDirectoryRouter);

// Employers.
const employer = Router();
employer.use(requireAuth, requireRole('employer'));
employer.use('/company', companyRouter);
employer.use('/jobs', employerJobsRouter);
apiRouter.use('/employer', employer);

// Admins.
const admin = Router();
admin.use(requireAuth, requireRole('admin'));
admin.use('/verifications', verificationRouter);
admin.use('/jobs', adminJobsRouter);
apiRouter.use('/admin', admin);
