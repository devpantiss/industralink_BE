import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';

/** Every API module is mounted here, under /api/v1. */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
