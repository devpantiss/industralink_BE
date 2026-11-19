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
