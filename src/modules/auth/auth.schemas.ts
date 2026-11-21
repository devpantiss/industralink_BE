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

const phoneField = z.string('Enter your mobile number.').transform((value, ctx) => {
  const phone = normalizeIndianPhone(value);
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number.' });
    return z.NEVER;
  }
  return phone;
});

const nameField = z.string('Enter your full name.').trim().min(2, 'Enter your full name.').max(80);

/** Test sign-up for a worker (real sign-up will also check the phone with an OTP). */
export const devSignupWorkerSchema = z.object({ name: nameField, phone: phoneField });

/** Test sign-up for an employer (real sign-up will also check the email / password). */
export const devSignupEmployerSchema = z.object({
  name: nameField,
  email: z.email('Enter a valid email address.').transform((email) => email.toLowerCase()),
  companyName: z.string('Enter the company name.').trim().min(2, 'Enter the company name.').max(120),
});
