import type { Company, User } from '../../generated/prisma/client.js';
import { forbidden } from '../../lib/errors.js';

/**
 * Throws if this account may not log in or use the API:
 * the user is blocked, or (for HR users) their company is blocked.
 */
export function assertCanUseAccount(user: User & { company?: Company | null }) {
  if (user.status === 'blocked') {
    throw forbidden('This account is blocked. Please contact support.', 'BLOCKED');
  }
  if (user.role === 'employer' && user.company?.status === 'blocked') {
    throw forbidden('This company account is blocked. Please contact support.', 'BLOCKED');
  }
}
