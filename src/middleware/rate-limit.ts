import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

/** General limit for the whole API, per IP address. Stricter limits for login come with the login phase. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { message: 'Too many requests. Please wait a minute and try again.', code: 'TOO_MANY_REQUESTS' },
});

/** The help form is open to everyone, so it gets a small limit against spam. */
export const supportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: {
    message: 'You sent several requests already. Please wait a few minutes.',
    code: 'TOO_MANY_REQUESTS',
  },
});

/**
 * Chat: at most 20 messages a minute per person, against spam.
 * Counted per user (not per IP), so many workers on one shared phone network are fine.
 * Used after requireAuth. Also on in tests, so the limit itself can be tested.
 */
export const chatSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.auth!.user.id,
  message: {
    message: 'You are sending messages too fast. Please wait a minute.',
    code: 'TOO_MANY_REQUESTS',
  },
});
