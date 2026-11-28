import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import type { User } from '../../generated/prisma/client.js';
import { AppError, conflict, forbidden, invalid } from '../../lib/errors.js';
import { assertRoleTab } from './role-tab.js';
import { createEmployerAccount, createWorkerAccount, findUserByEmail } from '../users/user.service.js';
import type { GoogleLoginInput } from './auth.schemas.js';
import { type GoogleProfile, type GoogleVerifier, googleVerifier } from './google-verifier.js';
import { type AuthResponse, type SessionMeta, startSession } from './session.service.js';

/** Off (null) until GOOGLE_CLIENT_IDS is set. Tests put in a fake one. */
let verifier: GoogleVerifier | null = env.GOOGLE_CLIENT_IDS.length
  ? googleVerifier(env.GOOGLE_CLIENT_IDS)
  : null;

export function setGoogleVerifier(next: GoogleVerifier | null) {
  verifier = next;
}

/**
 * "Sign in with Google" and "Sign up with Google" (one endpoint, for workers and HR).
 * - Known person: logs in. An account with the same email gets Google linked to it.
 * - New person: the account is created. A worker needs nothing more (Google has confirmed
 *   the email; the mobile number comes in the welcome steps). HR also gives a company name.
 */
export async function loginWithGoogle(
  input: GoogleLoginInput,
  meta: SessionMeta,
): Promise<AuthResponse & { created: boolean }> {
  if (!verifier) {
    throw new AppError(
      503,
      'GOOGLE_OFF',
      'Google sign-in is not available yet. Please use another way to log in.',
    );
  }
  const profile = await verifier.verify(input.idToken);

  const existing = await findGoogleUser(profile);
  if (existing) return { ...(await logIn(existing, profile, input, meta)), created: false };

  if (input.role === 'employer' && !input.companyName) {
    throw invalid('Enter your company name to finish signing up.', 'COMPANY_NAME_NEEDED');
  }

  let user: User;
  try {
    user =
      input.role === 'worker'
        ? await createWorkerAccount({ name: profile.name, email: profile.email, googleId: profile.googleId })
        : await createEmployerAccount({
            name: profile.name,
            email: profile.email,
            companyName: input.companyName!,
            googleId: profile.googleId,
          });
  } catch (error) {
    // Two taps at the same moment: the other request created the account, so log in to it.
    const raced = await findGoogleUser(profile);
    if (!raced) throw error;
    return { ...(await logIn(raced, profile, input, meta)), created: false };
  }
  return { ...(await startSession(user, meta)), created: true };
}

/** By Google's id first (stays the same if they change their Gmail address), then by email. */
async function findGoogleUser({ googleId, email }: GoogleProfile) {
  return (await prisma.user.findUnique({ where: { googleId } })) ?? (await findUserByEmail(email));
}

async function logIn(user: User, profile: GoogleProfile, input: GoogleLoginInput, meta: SessionMeta) {
  if (user.role === 'admin') {
    throw forbidden('Admin accounts log in with email and password.', 'GOOGLE_NOT_FOR_ADMIN');
  }
  assertRoleTab(user, input.role);
  if (user.googleId && user.googleId !== profile.googleId) {
    // Same email, but another Google account (e.g. the address was given to someone new).
    throw conflict('This email is already linked to a different Google account.', 'GOOGLE_ACCOUNT_MISMATCH');
  }

  // First Google sign-in on an account made another way: link it, so it is found by id from now on.
  // startSession checks blocked / deleted accounts.
  const linked = user.googleId
    ? user
    : await prisma.user.update({ where: { id: user.id }, data: { googleId: profile.googleId } });
  return startSession(linked, meta);
}
