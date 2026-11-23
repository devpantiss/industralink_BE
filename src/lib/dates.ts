/** India Standard Time is UTC+5:30 (no daylight saving). */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's date in India, as a date-only value (midnight UTC), to compare with DATE columns. */
export function todayInIndia(): Date {
  const indiaNow = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(indiaNow.toISOString().slice(0, 10));
}

/** Date-only text "YYYY-MM-DD", or undefined. */
export const toDateOnly = (date: Date | null | undefined) =>
  date ? date.toISOString().slice(0, 10) : undefined;

/** The day in India as "YYYY-MM-DD" (for grouping things per day). */
export const indiaDayKey = (date: Date) =>
  new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Short label for charts, e.g. "Mon" or "12 Nov", in India time. */
export const indiaLabel = (date: Date, style: 'weekday' | 'dayMonth') =>
  date.toLocaleDateString(
    'en-IN',
    style === 'weekday'
      ? { weekday: 'short', timeZone: 'Asia/Kolkata' }
      : { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' },
  );

export const DAY_MS = 24 * 60 * 60 * 1000;
