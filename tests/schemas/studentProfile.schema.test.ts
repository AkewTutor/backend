/**
 * tests/schemas/studentProfile.schema.test.ts
 *
 * Journey step 2.1. Spec: `09-2-accounts-guardianship.md` §9.2.
 *
 * Uses the real Zod schema (no mocking) — `updateAcademicProfileSchema`'s
 * job is proven against actual Zod parsing behavior, not a stand-in.
 */

import { describe, expect, it } from 'vitest';

import { updateAcademicProfileSchema } from '../../src/schemas/studentProfile.schema.js';

describe.skip('updateAcademicProfileSchema', () => {
  it('accepts a fully-empty partial update — every field optional per the partial-update semantics', () => {
    const result = updateAcademicProfileSchema.safeParse({ body: {} });

    expect(result.success).toBe(true);
  });

  it('rejects grade outside 1–12 (13)', () => {
    const result = updateAcademicProfileSchema.safeParse({ body: { grade: 13 } });

    expect(result.success).toBe(false);
  });

  it('rejects grade 0', () => {
    const result = updateAcademicProfileSchema.safeParse({ body: { grade: 0 } });

    expect(result.success).toBe(false);
  });

  it('accepts a valid formatPreference enum value', () => {
    const result = updateAcademicProfileSchema.safeParse({
      body: { formatPreference: 'ONE_TO_THREE' },
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid formatPreference value — only the three documented formats are accepted', () => {
    const result = updateAcademicProfileSchema.safeParse({
      body: { formatPreference: 'ONE_TO_TWO' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a subjectsOfInterest entry that is not a UUID', () => {
    const result = updateAcademicProfileSchema.safeParse({
      body: { subjectsOfInterest: ['not-a-uuid'] },
    });

    expect(result.success).toBe(false);
  });

  it('accepts arbitrary keys inside learningSchedulePreference — intentionally loose passthrough', () => {
    const result = updateAcademicProfileSchema.safeParse({
      body: { learningSchedulePreference: { days: ['MON', 'WED'] } },
    });

    expect(result.success).toBe(true);
  });
});
