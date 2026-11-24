import { z } from 'zod';
import { normalizeIndianPhone } from '../../lib/phone.js';
import { optionalText } from '../../lib/validation.js';

/** A guest's way to reach them: an email, or an Indian mobile number (saved as "+91 98765 43210"). */
const guestContact = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined;
    if (value.includes('@')) {
      if (!z.email().safeParse(value).success) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid email or 10-digit mobile number.' });
        return z.NEVER;
      }
      return value.toLowerCase();
    }
    const phone = normalizeIndianPhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid email or 10-digit mobile number.' });
      return z.NEVER;
    }
    return `+91 ${phone.slice(3)}`;
  });

/** POST /support. A logged-in user's name and contact come from their account. */
export const supportRequestSchema = z.object({
  topic: z.string('Choose a topic.').trim().min(2, 'Choose a topic.').max(80),
  message: z
    .string('Write your message.')
    .trim()
    .min(10, 'Write a little more so we can help, at least 10 letters.')
    .max(2000),
  name: optionalText(80),
  contact: guestContact,
});

/** GET /admin/support */
export const ticketListSchema = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
});

export type SupportRequestInput = z.infer<typeof supportRequestSchema>;
