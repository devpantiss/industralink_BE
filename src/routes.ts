import { Router } from 'express';
import { requireAuth, requireRole } from './middleware/auth.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import {
  adminJobsRouter,
  adminUsersRouter,
  userImpactRouter,
  verificationRouter,
} from './modules/admin/admin.routes.js';
import {
  applyRouter,
  candidatesRouter,
  employerApplicationsRouter,
  jobCandidatesRouter,
  workerApplicationsRouter,
} from './modules/applications/application.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { companyDirectoryRouter } from './modules/companies/company-directory.routes.js';
import { companyRouter } from './modules/companies/company.routes.js';
import {
  employerJobsRouter,
  publicJobsRouter,
  savedJobsRouter,
  workerJobsRouter,
} from './modules/jobs/job.routes.js';
import { adminHomeRouter, employerHomeRouter, workerHomeRouter } from './modules/home/home.routes.js';
import { notificationsRouter } from './modules/notifications/notification.routes.js';
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
me.use('/', settingsRouter);
apiRouter.use('/me', me);
apiRouter.use('/notifications', requireAuth, notificationsRouter);

// Workers.
const worker = Router();
worker.use(requireAuth, requireRole('worker'));
worker.use('/', workerProfileRouter, workerHomeRouter);
worker.use('/saved', savedJobsRouter);
worker.use('/applications', workerApplicationsRouter);
apiRouter.use('/worker', worker);

// Workers: finding jobs and companies.
const workerOnly = [requireAuth, requireRole('worker')];
apiRouter.use('/jobs', ...workerOnly, workerJobsRouter, applyRouter);
apiRouter.use('/companies', ...workerOnly, companyDirectoryRouter);

// Employers.
const employer = Router();
employer.use(requireAuth, requireRole('employer'));
employer.use('/', employerHomeRouter);
employer.use('/company', companyRouter);
employer.use('/jobs', employerJobsRouter, jobCandidatesRouter);
employer.use('/candidates', candidatesRouter);
employer.use('/applications', employerApplicationsRouter);
apiRouter.use('/employer', employer);

// Admins.
const admin = Router();
admin.use(requireAuth, requireRole('admin'));
admin.use('/', adminHomeRouter);
admin.use('/verifications', verificationRouter);
admin.use('/jobs', adminJobsRouter);
admin.use('/users', adminUsersRouter);
admin.use('/user-impact', userImpactRouter);
apiRouter.use('/admin', admin);
