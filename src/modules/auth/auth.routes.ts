import { Router } from 'express';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import * as authController from './auth.controller.js';

export const authRouter = Router();

authRouter.get('/me', requireAuth, authController.me);
authRouter.post('/logout', requireAuth, authController.logout);
authRouter.post('/onboarding/complete', requireAuth, authController.completeOnboarding);

// Temporary login for development, until the real login method is decided.
// Never registered in production.
if (!env.isProduction) {
  authRouter.get('/dev-users', authController.devUsers);
  authRouter.post('/dev-login', authController.devLogin);
}
