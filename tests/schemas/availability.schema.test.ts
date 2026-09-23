/**
 * tests/schemas/availability.schema.test.ts
 *
 * Journey step 2.13. Spec: `09-2-accounts-guardianship.md` §9.11.
 */

import { describe, expect, it } from 'vitest';

import { createSlotSchema, deleteSlotSchema } from '../../src/schemas/availability.schema.js';

const t1 = '2026-06-01T10:00:00Z';
const t2 = '2026-06-01T11:00:00Z';

describe('createSlotSchema', () => {
  it('requires dayOfWeek when isRecurring is true', () => {
    const result = createSlotSchema.safeParse({
      body: { isRecurring: true, startTime: t1, endTime: t2 },
    });

    expect(result.success).toBe(false);
  });

  it('allows an omitted dayOfWeek when isRecurring is false', () => {
    const result = createSlotSchema.safeParse({
      body: { isRecurring: false, startTime: t1, endTime: t2 },
    });

    expect(result.success).toBe(true);
  });

  it('rejects endTime before/equal to startTime', () => {
    const result = createSlotSchema.safeParse({
      body: {
        isRecurring: false,
        startTime: '2026-01-01T10:00:00Z',
        endTime: '2026-01-01T09:00:00Z',
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects dayOfWeek outside 0–6', () => {
    const result = createSlotSchema.safeParse({
      body: { dayOfWeek: 7, isRecurring: true, startTime: t1, endTime: t2 },
    });

    expect(result.success).toBe(false);
  });
});

describe('deleteSlotSchema', () => {
  it('requires a uuid slotId param', () => {
    const result = deleteSlotSchema.safeParse({ params: { slotId: 'not-a-uuid' } });

    expect(result.success).toBe(false);
  });

  it('accepts a valid uuid slotId param', () => {
    const result = deleteSlotSchema.safeParse({
      params: { slotId: '11111111-1111-4111-8111-111111111111' },
    });

    expect(result.success).toBe(true);
  });
});
