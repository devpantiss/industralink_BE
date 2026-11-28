import type { User } from '../../generated/prisma/client.js';
import { conflict } from '../../lib/errors.js';

/** The tab the person chose on the login / sign-up screen. */
export type RoleTab = 'worker' | 'employer';

const WRONG_TAB = {
  worker: 'This is a job seeker account. Choose “I need a job” to log in.',
  employer: 'This is a company (HR) account. Choose “I’m hiring” to log in.',
  admin: 'This is an admin account. Choose “I’m hiring” to log in.',
} as const;

/**
 * Refuses a login from the wrong tab, and says which tab to use.
 * Admins log in from the "I'm hiring" tab (or the admin page, which sends no tab).
 */
export function assertRoleTab(user: User, tab: RoleTab | undefined) {
  if (!tab || user.role === tab || (user.role === 'admin' && tab === 'employer')) return;
  throw conflict(WRONG_TAB[user.role], 'WRONG_ROLE');
}
