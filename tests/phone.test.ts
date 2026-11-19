import { describe, expect, it } from 'vitest';
import { normalizeIndianPhone } from '../src/lib/phone.js';

describe('normalizeIndianPhone', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['+91-98765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });

  it.each(['12345', '5876543210', '98765432101', 'abc'])('rejects %s', (input) => {
    expect(normalizeIndianPhone(input)).toBeNull();
  });
});
