import { Router } from 'express';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { authLimiter, loginAccountLimiter } from '../../middleware/rate-limit.js';
import * as authController from './auth.controller.js';

export const authRouter = Router();

authRouter.get('/me', requireAuth, authController.me);
authRouter.post('/logout', requireAuth, authController.logout);
authRouter.post('/onboarding/complete', requireAuth, authController.completeOnboarding);
authRouter.post('/password/change', requireAuth, authController.changePassword);

// Email + password (everyone) and Google (workers and HR).
authRouter.post('/signup/worker', authLimiter, authController.signupWorker);
authRouter.post('/signup/employer', authLimiter, authController.signupEmployer);
authRouter.post('/login', authLimiter, loginAccountLimiter, authController.login);
authRouter.post('/google', authLimiter, authController.googleLogin);

// One-tap demo logins for building and testing the apps.
// Only when DEV_LOGIN=true (the server refuses that setting in production).
if (env.DEV_LOGIN) {
  authRouter.get('/dev-users', authController.devUsers);
  authRouter.post('/dev-login', authController.devLogin);
}
