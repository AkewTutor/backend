/**
 * tests/schemas/challenge.schema.test.ts
 *
 * Journey step 6.10. Spec: `09-6-gamification-engagement.md` §9.7.
 * Exact shape pinned in `8-6-gamification-engagement.md`:
 * `createChallengeSchema = z.object({ body: z.object({ title, description,
 * period: 'WEEKLY'|'MONTHLY', startsAt: datetime, endsAt: datetime,
 * targetValue: positive int }).refine(endsAt > startsAt, "End time must be
 * after start time") })`.
 */

import { describe, expect, it } from 'vitest';

import { createChallengeSchema } from '../../src/schemas/challenge.schema.js';

function parse(body: Record<string, unknown>) {
  return createChallengeSchema.safeParse({ body, params: {}, query: {} });
}

const VALID = {
  title: 'Complete 3 assessments this week',
  description: '...',
  period: 'WEEKLY',
  startsAt: '2026-09-01T00:00:00Z',
  endsAt: '2026-09-07T23:59:59Z',
  targetValue: 3,
};

describe.skip('createChallengeSchema', () => {
  it('requires endsAt after startsAt', () => {
    const result = parse({
      ...VALID,
      startsAt: '2026-09-10T00:00:00Z',
      endsAt: '2026-09-01T00:00:00Z',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('End time must be after start time');
    }
  });

  it('accepts a valid ascending range', () => {
    const result = parse(VALID);
    expect(result.success).toBe(true);
  });

  it('rejects targetValue: 0', () => {
    const result = parse({ ...VALID, targetValue: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative targetValue', () => {
    const result = parse({ ...VALID, targetValue: -3 });
    expect(result.success).toBe(false);
  });

  it('rejects period: DAILY — restricted to WEEKLY|MONTHLY', () => {
    const result = parse({ ...VALID, period: 'DAILY' });
    expect(result.success).toBe(false);
  });
});
