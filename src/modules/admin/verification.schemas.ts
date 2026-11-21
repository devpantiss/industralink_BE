import { z } from 'zod';

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
