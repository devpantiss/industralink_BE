import { Router } from 'express';
import * as account from './account.controller.js';

/** Mounted at /api/v1/me (any logged-in user, see routes.ts). */
export const accountRouter = Router();

accountRouter.get('/settings', account.getSettings);
accountRouter.patch('/settings', account.updateSettings);
