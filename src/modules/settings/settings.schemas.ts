import { z } from 'zod';
import { LANGUAGES } from '../../lib/catalog.js';
import { normalizeIndianPhone } from '../../lib/phone.js';

export const updateSettingsSchema = z.object({
  language: z.enum(LANGUAGES, 'Choose English, Hindi or Odia.').optional(),
  jobAlerts: z.boolean().optional(),
  smsAlerts: z.boolean().optional(),
  whatsappAlerts: z.boolean().optional(),
  visibleToEmployers: z.boolean().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** The worker's mobile number (companies call it after shortlisting). Stored as +91XXXXXXXXXX. */
export const phoneSchema = z.object({
  phone: z.string('Enter your mobile number.').transform((value, ctx) => {
    const phone = normalizeIndianPhone(value);
    if (!phone) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a 10-digit mobile number that starts with 6, 7, 8 or 9.',
      });
      return z.NEVER;
    }
    return phone;
  }),
});
