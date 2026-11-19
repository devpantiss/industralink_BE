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
