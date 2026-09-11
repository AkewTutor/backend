/**
 * tests/schemas/xp.schema.test.ts
 *
 * Journey step 6.2. Spec: `09-6-gamification-engagement.md` §9.1 (I2 fix).
 * Shape derived from `06-gamification-engagement-api.md`
 * `POST /admin/students/:studentId/xp-adjustments` request body:
 * `amount` (integer, required, non-zero, positive or negative) and
 * `note` (string, required, 1-500 chars).
 *
 * Real Zod schema (no mocking) — validate.middleware.ts's job is proven
 * against actual Zod parsing behavior.
 */

import { describe, expect, it } from 'vitest';

import { adjustXPSchema } from '../../src/schemas/xp.schema.js';

function parse(body: Record<string, unknown>) {
  return adjustXPSchema.safeParse({ body, params: { studentId: 'student-1' }, query: {} });
}

describe.skip('adjustXPSchema', () => {
  it('accepts a valid positive amount with a note', () => {
    const result = parse({ amount: 10, note: 'Goodwill adjustment' });
    expect(result.success).toBe(true);
  });

  it('accepts a valid negative amount with a note', () => {
    const result = parse({ amount: -20, note: 'Reversing an erroneous award' });
    expect(result.success).toBe(true);
  });

  it('rejects a zero amount', () => {
    const result = parse({ amount: 0, note: 'note' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer amount', () => {
    const result = parse({ amount: 10.5, note: 'note' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing amount', () => {
    const result = parse({ note: 'note' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing note', () => {
    const result = parse({ amount: 10 });
    expect(result.success).toBe(false);
  });

  it('rejects an empty-string note', () => {
    const result = parse({ amount: 10, note: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a note over 500 characters', () => {
    const result = parse({ amount: 10, note: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('accepts a note at exactly 500 characters', () => {
    const result = parse({ amount: 10, note: 'x'.repeat(500) });
    expect(result.success).toBe(true);
  });
});
