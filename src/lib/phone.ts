/**
 * Turns an Indian mobile number into one standard form: +91XXXXXXXXXX.
 * Accepts "98765 43210", "+91-9876543210", "09876543210" and so on.
 * Returns null if it is not a valid Indian mobile number.
 */
export function normalizeIndianPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}
