import { z } from 'zod';
import { optionalText } from '../../lib/validation.js';

export const REPORT_REASONS = ['asks_money', 'fake', 'wrong_details', 'unsafe', 'other'] as const;

/** POST /jobs/:id/report */
export const reportJobSchema = z
  .object({
    reason: z.enum(REPORT_REASONS, 'Choose a reason.'),
    details: optionalText(500),
  })
  .refine((input) => input.reason !== 'other' || !!input.details, {
    message: 'Tell us what is wrong.',
    path: ['details'],
  });

/** GET /admin/reports */
export const reportListSchema = z.object({
  status: z.enum(['open', 'dismissed', 'job_removed', 'all']).default('open'),
});

/** POST /admin/reports/:id */
export const resolveReportSchema = z.object({
  action: z.enum(['dismiss', 'remove_job'], 'Choose dismiss or remove the job.'),
  note: optionalText(500),
});

export type ReportJobInput = z.infer<typeof reportJobSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
