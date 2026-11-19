import type { User } from '../generated/prisma/client.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth: the logged-in user and their session. */
      auth?: { user: User; sessionId: string };
    }
  }
}

export {};
