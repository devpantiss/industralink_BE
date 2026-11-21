import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as admin from './admin.controller.js';

/** Everything under /api/v1/admin. Admins only. */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

adminRouter.get('/verifications', admin.listVerifications);
adminRouter.post('/verifications/:kind/:id', admin.decideVerification);
