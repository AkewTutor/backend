/**
 * tests/schemas/reschedule.schema.test.ts
 *
 * Journey step 4.17. Spec: `09-4-class-delivery-library.md` §9.14.
 * FRs: FR-MK-004.
 */

import { describe, expect, it } from 'vitest';

import { requestRescheduleSchema } from '../../src/schemas/reschedule.schema.js';

describe.skip('requestRescheduleSchema', () => {
  it('requires a valid uuid sessionId and an ISO datetime requestedNewStart — both fail together', () => {
    const result = requestRescheduleSchema.safeParse({
      body: { sessionId: 'x', requestedNewStart: 'not-a-date' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toEqual(expect.arrayContaining(['body.sessionId', 'body.requestedNewStart']));
    }
  });

  it('passes with a valid uuid sessionId and a valid ISO datetime', () => {
    const result = requestRescheduleSchema.safeParse({
      body: {
        sessionId: '11111111-1111-4111-8111-111111111111',
        requestedNewStart: '2026-09-09T16:00:00Z',
      },
    });

    expect(result.success).toBe(true);
  });
});
