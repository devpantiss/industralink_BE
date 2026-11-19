import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Role } from '../generated/prisma/client.js';

export interface TokenPayload {
  /** User id */
  sub: string;
  role: Role;
  /** Session id: lets us log out or block a user immediately. */
  sid: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${env.SESSION_DAYS}d`,
  });
}

/** Returns the payload, or null if the token is invalid or expired. */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub || !decoded.sid) return null;
    return decoded as TokenPayload;
  } catch {
    return null;
  }
}
