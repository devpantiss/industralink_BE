import { Router } from 'express';
import * as settings from './settings.controller.js';

/** Mounted at /api/v1/me (any logged-in user, see routes.ts). */
export const settingsRouter = Router();

settingsRouter.get('/settings', settings.getSettings);
settingsRouter.patch('/settings', settings.updateSettings);
