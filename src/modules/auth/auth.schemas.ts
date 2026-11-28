import { z } from 'zod';
import { normalizeIndianPhone } from '../../lib/phone.js';

/** Dev login: pick the demo user by exactly one of id, email or phone. */
export const devLoginSchema = z
  .object({
    userId: z.uuid('userId must be a valid id.').optional(),
    email: z
      .email('Enter a valid email address.')
      .transform((email) => email.toLowerCase())
      .optional(),
    phone: z
      .string()
      .transform((value, ctx) => {
        const phone = normalizeIndianPhone(value);
        if (!phone) {
          ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number.' });
          return z.NEVER;
        }
        return phone;
      })
      .optional(),
  })
  .refine((body) => [body.userId, body.email, body.phone].filter(Boolean).length === 1, {
    message: 'Send exactly one of userId, email or phone.',
  });

export type DevLoginInput = z.infer<typeof devLoginSchema>;

const nameField = z.string('Enter your full name.').trim().min(2, 'Enter your full name.').max(80);

const emailField = z
  .string('Enter your email address.')
  .trim()
  .max(254, 'This email address is too long.')
  .pipe(z.email('Enter a valid email address.'))
  .transform((email) => email.toLowerCase());

/** New passwords. Long passphrases are welcome; spaces count. */
const newPasswordField = z
  .string('Enter a password.')
  .min(8, 'Use at least 8 characters for your password.')
  .max(128, 'Use at most 128 characters for your password.');

/** Login: no length rules, so an old password always gets a clear "wrong password" answer. */
const passwordField = z.string('Enter your password.').min(1, 'Enter your password.').max(128);

const companyNameField = z
  .string('Enter the company name.')
  .trim()
  .min(2, 'Enter the company name.')
  .max(120);

const roleField = z.enum(['worker', 'employer'], 'Choose “I need a job” or “I’m hiring”.');

const phoneField = z.string('Enter your mobile number.').transform((value, ctx) => {
  const phone = normalizeIndianPhone(value);
  if (!phone) {
    ctx.addIssue({
      code: 'custom',
      message: 'Enter a 10-digit mobile number that starts with 6, 7, 8 or 9.',
    });
    return z.NEVER;
  }
  return phone;
});

/** Worker sign-up. The mobile number is for companies to call (not checked by SMS). */
export const signupWorkerSchema = z.object({
  name: nameField,
  phone: phoneField,
  email: emailField,
  password: newPasswordField,
});

export const signupEmployerSchema = z.object({
  name: nameField,
  email: emailField,
  password: newPasswordField,
  companyName: companyNameField,
});

/**
 * `role` is the tab the person chose. Optional: the admin login page sends none.
 * Admins may also use the "I'm hiring" tab (it says "company and admin accounts").
 */
export const loginSchema = z.object({
  email: emailField,
  password: passwordField,
  role: roleField.optional(),
});

/** `current` is not needed when the account has no password yet (made with Google). */
export const changePasswordSchema = z.object({
  current: z.string().max(128).optional(),
  next: newPasswordField,
});

export type SignupWorkerInput = z.infer<typeof signupWorkerSchema>;
export type SignupEmployerInput = z.infer<typeof signupEmployerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Sign in / sign up with Google. `idToken` is what Google gives the app
 * (Android Credential Manager, or `credential` from Google's web button).
 */
export const googleLoginSchema = z.object({
  idToken: z
    .string('Google sign-in did not work. Please try again.')
    .trim()
    .min(100, 'Google sign-in did not work. Please try again.')
    .max(8192, 'Google sign-in did not work. Please try again.'),
  role: roleField,
  /** HR only, and only the first time (a new company). */
  companyName: companyNameField.optional(),
});

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
