/**
 * tests/schemas/tutorProfile.schema.test.ts
 *
 * Journey step 2.9. Spec: `09-2-accounts-guardianship.md` §9.8.
 * OWASP: A08:2021 – Software and Data Integrity Failures (mass-assignment
 *        guard against `verificationStatus` — schema-level companion to
 *        the service-level guard in 2.10).
 */

import { describe, expect, it } from 'vitest';

import {
  rankSubjectsSchema,
  updateTutorProfileSchema,
} from '../../src/schemas/tutorProfile.schema.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe.skip('rankSubjectsSchema', () => {
  it('accepts exactly 2 uniquely-ranked subjects', () => {
    const result = rankSubjectsSchema.safeParse({
      body: {
        subjects: [
          { subjectId: A, rank: 1 },
          { subjectId: B, rank: 2 },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts exactly 1 subject', () => {
    const result = rankSubjectsSchema.safeParse({
      body: { subjects: [{ subjectId: A, rank: 1 }] },
    });

    expect(result.success).toBe(true);
  });

  it('rejects 3 subjects — schema-level .max(2) cap', () => {
    const C = '33333333-3333-4333-8333-333333333333';
    const result = rankSubjectsSchema.safeParse({
      body: {
        subjects: [
          { subjectId: A, rank: 1 },
          { subjectId: B, rank: 2 },
          { subjectId: C, rank: 1 },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a duplicate subjectId', () => {
    const result = rankSubjectsSchema.safeParse({
      body: {
        subjects: [
          { subjectId: A, rank: 1 },
          { subjectId: A, rank: 2 },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a duplicate rank', () => {
    const result = rankSubjectsSchema.safeParse({
      body: {
        subjects: [
          { subjectId: A, rank: 1 },
          { subjectId: B, rank: 1 },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects rank values outside {1,2}', () => {
    const result = rankSubjectsSchema.safeParse({
      body: { subjects: [{ subjectId: A, rank: 3 }] },
    });

    expect(result.success).toBe(false);
  });
});

describe.skip('updateTutorProfileSchema', () => {
  it('does not accept a verificationStatus field — mass-assignment guard', () => {
    const result = updateTutorProfileSchema.safeParse({
      body: { bio: 'Experienced tutor.', verificationStatus: 'VERIFIED' },
    });

    if (result.success) {
      expect((result.data as any).body).not.toHaveProperty('verificationStatus');
    } else {
      expect(result.success).toBe(false);
    }
  });
});
