import { Router } from 'express';
import { optionalAuth } from '../../middleware/auth.js';
import { supportLimiter } from '../../middleware/rate-limit.js';
import * as support from './support.controller.js';

/** Mounted at /api/v1/support. Anyone can send it; with a login, contact comes from the account. */
export const supportRouter = Router();
supportRouter.post('/', supportLimiter, optionalAuth, support.create);

/** Mounted at /api/v1/admin/support (admins only). */
export const adminSupportRouter = Router();
adminSupportRouter.get('/', support.list);
adminSupportRouter.post('/:id/close', support.close);
