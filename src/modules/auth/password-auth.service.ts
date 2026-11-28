import type { User } from '../../generated/prisma/client.js';
import { invalid, unauthorized } from '../../lib/errors.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../db/prisma.js';
import { createEmployerAccount, createWorkerAccount, findUserByEmail } from '../users/user.service.js';
import type {
  ChangePasswordInput,
  LoginInput,
  SignupEmployerInput,
  SignupWorkerInput,
} from './auth.schemas.js';
import { assertRoleTab } from './role-tab.js';
import { revokeOtherSessions, startSession, type SessionMeta } from './session.service.js';

/** The same answer for an unknown email and a wrong password, so emails can't be tested. */
const wrongLogin = () => unauthorized('Wrong email or password.', 'INVALID_CREDENTIALS');

/** Worker sign-up with name, mobile number, email and password. */
export async function signupWorker({ name, phone, email, password }: SignupWorkerInput, meta: SessionMeta) {
  const user = await createWorkerAccount({ name, phone, email, passwordHash: await hashPassword(password) });
  return startSession(user, meta);
}

/** HR sign-up: the company is created too and waits for approval. */
export async function signupEmployer(
  { name, email, password, companyName }: SignupEmployerInput,
  meta: SessionMeta,
) {
  const user = await createEmployerAccount({
    name,
    email,
    companyName,
    passwordHash: await hashPassword(password),
  });
  return startSession(user, meta);
}

/** Email + password login for every role. */
export async function loginWithPassword({ email, password, role }: LoginInput, meta: SessionMeta) {
  const user = await findUserByEmail(email);
  if (!user) {
    await burnPasswordCheck(password);
    throw wrongLogin();
  }
  if (!user.passwordHash) {
    throw unauthorized('This account uses Google. Tap “Sign in with Google”.', 'USE_GOOGLE');
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw wrongLogin();

  // Only after the password is right, so the tab hint doesn't tell strangers what an email is.
  assertRoleTab(user, role);
  return startSession(user, meta);
}

/**
 * Change the password, or set a first one on an account made with Google.
 * Every other device is logged out; this one stays logged in.
 */
export async function changePassword(user: User, sessionId: string, { current, next }: ChangePasswordInput) {
  if (user.passwordHash && !(current && (await verifyPassword(current, user.passwordHash)))) {
    throw invalid('Your current password is not right.', 'WRONG_PASSWORD');
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await revokeOtherSessions(user.id, sessionId);
}
