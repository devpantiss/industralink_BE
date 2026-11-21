import { z } from 'zod';
import { notFound } from './errors.js';
import { normalizeIndianPhone } from './phone.js';

/** Trims text; an empty string becomes null (= clear the field). */
const emptyToNull = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** For query strings: an empty value means "not set". */
export const blankToUndefined = (value: unknown) => (value === '' || value === null ? undefined : value);

/** Query string flag: "true" = on, anything else = off. */
export const queryFlag = z.preprocess((value) => value === true || value === 'true', z.boolean()).optional();

/** Optional text field that can be cleared with "" or null. */
export const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().max(max, `Keep this under ${max} characters.`).nullable()).optional();

/** Optional choice from a fixed list; "" or null clears it. */
export const optionalChoice = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(emptyToNull, z.enum(values).nullable()).optional();

/** List of short texts, trimmed, empty items and duplicates removed. */
export const textList = (maxItems: number, maxLength = 60) =>
  z
    .array(z.string().trim().max(maxLength, `Keep each item under ${maxLength} characters.`))
    .max(maxItems, `Add at most ${maxItems} items.`)
    .transform((items) => [...new Set(items.filter(Boolean))])
    .optional();

export const optionalPincode = z
  .preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{6}$/, 'Pincode has 6 digits.')
      .nullable(),
  )
  .optional();

/** Indian mobile number in any common format, stored as +91XXXXXXXXXX. */
export const optionalPhone = z
  .preprocess(
    emptyToNull,
    z
      .string()
      .nullable()
      .transform((value, ctx) => {
        if (value === null) return null;
        const phone = normalizeIndianPhone(value);
        if (!phone) {
          ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number.' });
          return z.NEVER;
        }
        return phone;
      }),
  )
  .optional();

/** Whole number in a range; "" or null clears it. */
export const optionalInt = (min: number, max: number) =>
  z
    .preprocess(
      (value) => (value === '' ? null : value),
      z.coerce.number().int().min(min).max(max).nullable(),
    )
    .optional();

/** City + state, as the apps send it: { city, state }. */
export const optionalLocation = z
  .object({ city: optionalText(80), state: optionalText(80) })
  .nullable()
  .optional();

/** Date as "YYYY-MM-DD"; "" or null clears it. */
export const optionalDate = z
  .preprocess(emptyToNull, z.iso.date('Use a date like 1995-08-21.').nullable())
  .optional();

/** Ids in URLs are UUIDs. Anything else cannot exist, so it is a 404. */
export function parseId(value: unknown, what = 'Item'): string {
  const result = z.uuid().safeParse(value);
  if (!result.success) throw notFound(`${what} not found.`);
  return result.data;
}
