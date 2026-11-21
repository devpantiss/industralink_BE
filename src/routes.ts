import { Router } from 'express';
import { accountRouter } from './modules/account/account.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { employerRouter } from './modules/companies/company.routes.js';
import { workerRouter } from './modules/workers/worker.routes.js';

/** Every API module is mounted here, under /api/v1. */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/me', accountRouter);
apiRouter.use('/worker', workerRouter);
apiRouter.use('/employer', employerRouter);
apiRouter.use('/admin', adminRouter);
