import { z } from 'zod';
import { PAY_PERIODS, PAY_TYPES } from '../../lib/catalog.js';
import { blankToUndefined, optionalText } from '../../lib/validation.js';

// ── Worker ──

/** POST /jobs/:id/apply. With "document", the worker picks one of their uploaded files. */
export const applySchema = z.object({
  sentWith: z.enum(['profile', 'document'], 'Choose how to apply.').default('profile'),
  documentId: z.preprocess(blankToUndefined, z.uuid('Choose a resume to send.').optional()),
});

export const interviewReplySchema = z.object({
  response: z.enum(['attending', 'cant_attend'], 'Choose a reply.'),
  note: optionalText(300),
});

export const offerReplySchema = z.object({
  response: z.enum(['accepted', 'declined'], 'Choose a reply.'),
  note: optionalText(300),
});

// ── Employer ──

/** Stages HR can move a candidate to. "applied" and "withdrawn" are set by the worker only. */
export const EMPLOYER_STAGES = ['shortlisted', 'interview', 'offer', 'hired', 'rejected'] as const;

const interviewSchema = z.object({
  at: z.iso.datetime({ offset: true, message: 'Choose the interview date and time.' }),
  place: optionalText(200),
  contactPerson: optionalText(80),
  bring: optionalText(200),
});

const offerSchema = z.object({
  pay: z.coerce
    .number('Add the pay you are offering.')
    .int()
    .min(1, 'Add the pay you are offering.')
    .max(10_000_000),
  payPeriod: z.enum(PAY_PERIODS).default('month'),
  payType: z.enum(PAY_TYPES).optional(),
  joiningDate: z.iso.date('Choose a joining date.'),
  place: z
    .string('Add where the worker should report on the first day.')
    .trim()
    .min(2, 'Add where the worker should report on the first day.')
    .max(200),
  note: optionalText(500),
});

/** PATCH /employer/applications/:id */
export const moveCandidateSchema = z
  .object({
    stage: z.enum(EMPLOYER_STAGES, 'Choose a stage.'),
    /** Shown to the worker, except on "rejected" (then it is HR's private reason). */
    note: optionalText(500),
    /** false = don't tell the worker about a rejection. */
    notify: z.boolean().default(true),
    interview: interviewSchema.optional(),
    offer: offerSchema.optional(),
  })
  .refine((input) => input.stage !== 'interview' || input.interview, {
    message: 'Add the interview date, time and place.',
    path: ['interview'],
  })
  .refine((input) => input.stage !== 'offer' || input.offer, {
    message: 'Add the offer details: pay, joining date and place.',
    path: ['offer'],
  });

export const candidateListSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
  stage: z.preprocess(
    blankToUndefined,
    z.enum(['applied', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']).optional(),
  ),
  jobId: z.preprocess(blankToUndefined, z.uuid('Choose a job from the list.').optional()),
});

export type ApplyInput = z.infer<typeof applySchema>;
export type InterviewReplyInput = z.infer<typeof interviewReplySchema>;
export type OfferReplyInput = z.infer<typeof offerReplySchema>;
export type MoveCandidateInput = z.infer<typeof moveCandidateSchema>;
export type CandidateListInput = z.infer<typeof candidateListSchema>;
