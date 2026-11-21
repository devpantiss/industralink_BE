import { z } from 'zod';
import { blankToUndefined } from '../../lib/validation.js';

// ── Company verification ──

export const listVerificationsSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
});

export const decideVerificationSchema = z
  .object({
    decision: z.enum(['approve', 'reject'], 'Choose approve or reject.'),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((body) => body.decision === 'approve' || !!body.reason, {
    message: 'Please give a reason for rejecting.',
    path: ['reason'],
  });

export type DecideVerificationInput = z.infer<typeof decideVerificationSchema>;

// ── Jobs ──

export const adminJobListSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  status: z.preprocess(blankToUndefined, z.enum(['active', 'closed']).optional()),
});

export const removeJobSchema = z.object({
  reason: z
    .string('Please give a reason for removing this job.')
    .trim()
    .min(3, 'Please give a reason for removing this job.')
    .max(500),
});

// ── Users ──

export const userStatusSchema = z.object({
  status: z.enum(['active', 'blocked'], 'Choose active or blocked.'),
});
