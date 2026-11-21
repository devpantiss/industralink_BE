import { Router } from 'express';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import * as authController from './auth.controller.js';

export const authRouter = Router();

authRouter.get('/me', requireAuth, authController.me);
authRouter.post('/logout', requireAuth, authController.logout);
authRouter.post('/onboarding/complete', requireAuth, authController.completeOnboarding);

// Test login and sign-up, until the real login method is decided.
// Only when DEV_LOGIN=true (the server refuses that setting in production).
if (env.DEV_LOGIN) {
  authRouter.get('/dev-users', authController.devUsers);
  authRouter.post('/dev-login', authController.devLogin);
  authRouter.post('/dev-signup/worker', authController.devSignupWorker);
  authRouter.post('/dev-signup/employer', authController.devSignupEmployer);
}
