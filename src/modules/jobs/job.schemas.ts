import { z } from 'zod';
import {
  BENEFITS,
  EXPERIENCE,
  JOB_STATUSES,
  JOB_TYPES,
  PAY_PERIODS,
  PAY_TYPES,
  SECTORS,
  SHIFTS,
  TRADES,
} from '../../lib/catalog.js';
import {
  blankToUndefined,
  optionalChoice,
  optionalDate,
  optionalInt,
  optionalPhone,
  optionalPincode,
  optionalText,
  queryFlag,
  textList,
} from '../../lib/validation.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:00.');

const walkInSchema = z.object({
  date: z.iso.date('Use a date like 2026-12-01.'),
  endDate: optionalDate,
  time,
  endTime: z.preprocess(blankToUndefined, time.optional()),
  address: z.string().trim().min(3, 'Add the walk-in address.').max(300),
  contactPerson: optionalText(80),
  bring: optionalText(300),
});

export type WalkInInput = z.infer<typeof walkInSchema>;

/** Every field of the job form. Cross-field rules (pay order, publishing) are in job.rules.ts. */
const jobFields = z.object({
  title: z.string().trim().min(3, 'Enter a job title.').max(100),
  trade: z.enum(TRADES, 'Choose a trade.'),
  sector: z.enum(SECTORS, 'Choose an industry.'),
  location: z.object({
    city: z.string().trim().min(1, 'Add the city of the work site.').max(80),
    state: z.string().trim().max(80).default(''),
  }),
  siteName: optionalText(100),
  address: optionalText(300),
  pincode: optionalPincode,
  payMin: optionalInt(0, 1_000_000),
  payMax: optionalInt(0, 1_000_000),
  payPeriod: z.enum(PAY_PERIODS),
  payType: optionalChoice(PAY_TYPES),
  shift: z.enum(SHIFTS),
  workHours: optionalText(100),
  jobType: z.enum(JOB_TYPES),
  contractLength: optionalText(50),
  walkIn: walkInSchema.nullable(),
  openings: z.coerce.number().int().min(1, 'Add at least 1 opening.').max(1000),
  experience: z.enum(EXPERIENCE),
  qualifications: textList(10),
  licences: textList(15),
  benefits: z
    .array(z.enum(BENEFITS))
    .max(BENEFITS.length)
    .transform((items) => [...new Set(items)]),
  responsibilities: textList(20, 300),
  requirements: textList(20, 300),
  status: z.enum(JOB_STATUSES),
  deadline: optionalDate,
  /** HR number. Workers see it only after shortlisting, and only if allowCalls is on. */
  hrPhone: optionalPhone,
  allowCalls: z.boolean(),
  callHours: optionalText(50),
});

/** POST /employer/jobs: title, trade, sector and location are needed; the rest has defaults. */
export const createJobSchema = jobFields.partial().required({
  title: true,
  trade: true,
  sector: true,
  location: true,
});

/** PATCH /employer/jobs/:id: only the fields sent are changed. Unknown fields are ignored. */
export const updateJobSchema = jobFields.partial();

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;

export const employerJobListSchema = z.object({
  status: z.preprocess(blankToUndefined, z.enum(JOB_STATUSES).optional()),
});

/** GET /jobs and /public/jobs (same as JobSearchParams in the apps). */
export const jobSearchSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  city: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
  trade: z.preprocess(blankToUndefined, z.enum(TRADES).optional()),
  sector: z.preprocess(blankToUndefined, z.enum(SECTORS).optional()),
  shift: z.preprocess(blankToUndefined, z.enum(SHIFTS).optional()),
  minPay: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(1_000_000).optional()),
  foodStay: queryFlag,
  walkInOnly: queryFlag,
  /** Every listed job is from a verified company, so this filter changes nothing. Kept for the apps. */
  verifiedOnly: queryFlag,
  sort: z.preprocess(blankToUndefined, z.enum(['newest', 'pay', 'nearest']).default('newest')),
  page: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(1000).default(1)),
});

export type JobSearchInput = z.infer<typeof jobSearchSchema>;
