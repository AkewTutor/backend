/**
 * tests/schemas/weeklyAssessment.schema.test.ts
 *
 * Journey step 4.24. Spec: `09-4-class-delivery-library.md` §9.19.
 * FRs: FR-SP-038, FR-TU-017.
 */

import { describe, expect, it } from 'vitest';

import { submitAssessmentSchema } from '../../src/schemas/weeklyAssessment.schema.js';

const validMembershipId = '11111111-1111-4111-8111-111111111111';

describe.skip('submitAssessmentSchema', () => {
  it('requires tutorFeedback — missing it fails even with the rest of the body valid', () => {
    const result = submitAssessmentSchema.safeParse({
      body: { cohortMembershipId: validMembershipId, weekStartDate: '2026-06-01' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty-string tutorFeedback (min(1))', () => {
    const result = submitAssessmentSchema.safeParse({
      body: {
        cohortMembershipId: validMembershipId,
        weekStartDate: '2026-06-01',
        tutorFeedback: '',
      },
    });

    expect(result.success).toBe(false);
  });

  it('scoreSummary is optional — passes without it', () => {
    const result = submitAssessmentSchema.safeParse({
      body: {
        cohortMembershipId: validMembershipId,
        weekStartDate: '2026-06-01',
        tutorFeedback: 'Great progress this week.',
      },
    });

    expect(result.success).toBe(true);
  });

  it('passes with scoreSummary also supplied', () => {
    const result = submitAssessmentSchema.safeParse({
      body: {
        cohortMembershipId: validMembershipId,
        weekStartDate: '2026-06-01',
        scoreSummary: '82%',
        tutorFeedback: 'Great progress this week.',
      },
    });

    expect(result.success).toBe(true);
  });
});
