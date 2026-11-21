import { z } from 'zod';
import {
  AVAILABILITY,
  EMPLOYMENT_TYPES,
  EXPERIENCE,
  GENDERS,
  SHIFT_PREFERENCES,
  TRADES,
  WORKER_DOC_TYPES,
} from '../../lib/catalog.js';
import {
  optionalChoice,
  optionalDate,
  optionalInt,
  optionalLocation,
  optionalPincode,
  optionalText,
  textList,
} from '../../lib/validation.js';

const thisYear = new Date().getFullYear();
const year = z.coerce
  .number('Enter a year like 2019.')
  .int()
  .min(1960, 'Enter a year after 1960.')
  .max(thisYear, `Enter a year up to ${thisYear}.`);

const workHistoryItem = z
  .object({
    company: z.string().trim().min(1, 'Add the company name.').max(120),
    role: z.string().trim().min(1, 'Add your role.').max(80),
    from: year,
    /** Empty = still working there. */
    to: z.preprocess((value) => (value === '' || value === null ? undefined : value), year.optional()),
  })
  .refine((item) => item.to === undefined || item.to >= item.from, {
    message: 'End year must be the same as or after the start year.',
    path: ['to'],
  });

/**
 * PATCH /worker/profile. Every field is optional: only the fields sent are changed.
 * Unknown fields (userId, phone, completeness...) are ignored. Phone cannot be changed here.
 */
export const updateWorkerProfileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(80).optional(),
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .email('Enter a valid email address.')
      .transform((email) => email.toLowerCase())
      .nullable()
      .optional(),
  ),
  trade: optionalChoice(TRADES),
  experience: optionalChoice(EXPERIENCE),
  qualifications: textList(10),
  licences: textList(15),
  skills: textList(20),
  languages: textList(15),
  location: optionalLocation,
  address: optionalText(300),
  pincode: optionalPincode,
  willingToRelocate: z.boolean().optional(),
  expectedPay: optionalInt(0, 1_000_000),
  shiftPreference: optionalChoice(SHIFT_PREFERENCES),
  availability: z.enum(AVAILABILITY).optional(),
  employmentType: optionalChoice(EMPLOYMENT_TYPES),
  about: optionalText(1000),
  dob: optionalDate,
  gender: optionalChoice(GENDERS),
  safetyTrainingHours: optionalInt(0, 10_000),
  /** New photo as a data URL, or null / "" to remove it. An unchanged link is ignored. */
  photoUrl: z.string().nullable().optional(),
  /** Replaces the whole list. */
  workHistory: z.array(workHistoryItem).max(20, 'Add at most 20 past jobs.').optional(),
});

export type UpdateWorkerProfileInput = z.infer<typeof updateWorkerProfileSchema>;

export const uploadWorkerDocumentSchema = z.object({
  type: z.enum(WORKER_DOC_TYPES, 'Choose what kind of document this is.').default('resume'),
});
