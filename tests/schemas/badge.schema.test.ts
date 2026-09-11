/**
 * tests/schemas/badge.schema.test.ts
 *
 * Journey step 6.6. Spec: `09-6-gamification-engagement.md` §9.1 (I2 fix).
 * Shape derived from `06-gamification-engagement-api.md` `POST /admin/badges`
 * request body: name/description/criteriaDescription (required strings),
 * category (required enum STUDENT|TUTOR), isActive (optional boolean,
 * default true).
 */

import { describe, expect, it } from 'vitest';

import { createBadgeSchema } from '../../src/schemas/badge.schema.js';

function parse(body: Record<string, unknown>) {
  return createBadgeSchema.safeParse({ body, params: {}, query: {} });
}

describe.skip('createBadgeSchema', () => {
  it('accepts a valid badge definition', () => {
    const result = parse({
      name: 'Quarter Champion',
      description: 'Reach a 90-day streak',
      category: 'STUDENT',
      criteriaDescription: 'Reach a 90-day streak',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an explicit isActive: false', () => {
    const result = parse({
      name: 'Quarter Champion',
      description: '...',
      category: 'TUTOR',
      criteriaDescription: '...',
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = parse({
      description: '...',
      category: 'STUDENT',
      criteriaDescription: '...',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing description', () => {
    const result = parse({
      name: 'x',
      category: 'STUDENT',
      criteriaDescription: '...',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing criteriaDescription', () => {
    const result = parse({
      name: 'x',
      description: '...',
      category: 'STUDENT',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid category', () => {
    const result = parse({
      name: 'x',
      description: '...',
      category: 'ADMIN',
      criteriaDescription: '...',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-boolean isActive', () => {
    const result = parse({
      name: 'x',
      description: '...',
      category: 'STUDENT',
      criteriaDescription: '...',
      isActive: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('does not accept a rating-derived field as part of the schema shape', () => {
    const result = parse({
      name: 'x',
      description: '...',
      category: 'STUDENT',
      criteriaDescription: '...',
      rating: 5,
    });
    // Extra unknown keys should not make an otherwise-valid payload fail —
    // this asserts the schema itself never defines a `rating` field, not
    // that it strictly rejects unknown keys.
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).body).not.toHaveProperty('rating');
    }
  });
});
