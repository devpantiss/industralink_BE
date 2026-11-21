import { z } from 'zod';
import { LANGUAGES } from '../../lib/catalog.js';

export const updateSettingsSchema = z.object({
  language: z.enum(LANGUAGES, 'Choose English, Hindi or Odia.').optional(),
  jobAlerts: z.boolean().optional(),
  smsAlerts: z.boolean().optional(),
  whatsappAlerts: z.boolean().optional(),
  visibleToEmployers: z.boolean().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
