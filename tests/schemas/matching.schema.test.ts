/**
 * tests/schemas/matching.schema.test.ts
 *
 * Journey step 3.1. Spec: `09-3-matching-cohorts.md` §9.2.
 * Function-level ref: `8-3-matching-cohorts.md` — src/schemas/matching.schema.ts.
 *
 * Unit tier — real Zod schemas, no mocking. Uses randomUUID() for
 * syntactically-valid UUIDs per `00-test-fixtures.md` §1 item 1 (Unit-tier
 * FK-shaped values never need to reference a real row).
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  noExactMatchSchema,
  searchTutorsQuerySchema,
  selectTutorSchema,
} from '../../src/schemas/matching.schema.js';

describe.skip('searchTutorsQuerySchema', () => {
  it('requires subjectId and grade', () => {
    const result = searchTutorsQuerySchema.safeParse({ query: {} });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toEqual(
        expect.arrayContaining([
          expect.stringContaining('subjectId'),
          expect.stringContaining('grade'),
        ]),
      );
    }
  });

  it('rejects grade outside 1-12', () => {
    const result = searchTutorsQuerySchema.safeParse({
      query: { subjectId: randomUUID(), grade: '13' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects grade below 1', () => {
    const result = searchTutorsQuerySchema.safeParse({
      query: { subjectId: randomUUID(), grade: '0' },
    });

    expect(result.success).toBe(false);
  });

  it('coerces a numeric-string grade within range', () => {
    const result = searchTutorsQuerySchema.safeParse({
      query: { subjectId: randomUUID(), grade: '9' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.grade).toBe(9);
    }
  });

  it('accepts an optional studentId (parent-on-behalf-of case)', () => {
    const result = searchTutorsQuerySchema.safeParse({
      query: { subjectId: randomUUID(), grade: '9', studentId: randomUUID() },
    });

    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID subjectId', () => {
    const result = searchTutorsQuerySchema.safeParse({
      query: { subjectId: 'not-a-uuid', grade: '9' },
    });

    expect(result.success).toBe(false);
  });

  it('accepts optional budget, language, priceMax, and scheduleAvailability filters', () => {
    const result = searchTutorsQuerySchema.safeParse({
      query: {
        subjectId: randomUUID(),
        grade: '9',
        budget: '300.00',
        language: 'Amharic',
        priceMax: '500.00',
        scheduleAvailability: { monday: ['09:00-10:00'] },
      },
    });

    expect(result.success).toBe(true);
  });
});

describe.skip('selectTutorSchema', () => {
  it('requires tutorId', () => {
    const result = selectTutorSchema.safeParse({ body: {} });

    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID tutorId', () => {
    const result = selectTutorSchema.safeParse({ body: { tutorId: 'nope' } });

    expect(result.success).toBe(false);
  });

  it('accepts a valid tutorId with no studentId (student self case)', () => {
    const result = selectTutorSchema.safeParse({ body: { tutorId: randomUUID() } });

    expect(result.success).toBe(true);
  });

  it('accepts an optional studentId (parent-on-behalf-of case)', () => {
    const result = selectTutorSchema.safeParse({
      body: { tutorId: randomUUID(), studentId: randomUUID() },
    });

    expect(result.success).toBe(true);
  });
});

describe.skip('noExactMatchSchema', () => {
  it('accepts an empty body (student self case) — studentId optional, defaults to caller', () => {
    const result = noExactMatchSchema.safeParse({ body: {} });

    expect(result.success).toBe(true);
  });

  it('accepts an optional studentId', () => {
    const result = noExactMatchSchema.safeParse({ body: { studentId: randomUUID() } });

    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID studentId when provided', () => {
    const result = noExactMatchSchema.safeParse({ body: { studentId: 'nope' } });

    expect(result.success).toBe(false);
  });
});
