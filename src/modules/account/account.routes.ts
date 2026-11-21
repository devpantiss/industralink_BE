import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as account from './account.controller.js';

/** Everything under /api/v1/me. Any logged-in user. */
export const accountRouter = Router();

accountRouter.use(requireAuth);

accountRouter.get('/settings', account.getSettings);
accountRouter.patch('/settings', account.updateSettings);
