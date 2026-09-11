/**
 * tests/schemas/recordingConsent.schema.test.ts
 *
 * Journey step 4.5. Spec: `09-4-class-delivery-library.md` §9.5.
 * FRs: FR-SC-008–009.
 */

import { describe, expect, it } from 'vitest';

import { acknowledgeConsentSchema } from '../../src/schemas/recordingConsent.schema.js';

describe.skip('acknowledgeConsentSchema', () => {
  it('requires both tutorId and studentId as uuids — a non-uuid tutorId with no studentId fails', () => {
    const result = acknowledgeConsentSchema.safeParse({ body: { tutorId: 'x' } });

    expect(result.success).toBe(false);
  });

  it('passes with two valid uuids', () => {
    const result = acknowledgeConsentSchema.safeParse({
      body: {
        tutorId: '11111111-1111-4111-8111-111111111111',
        studentId: '22222222-2222-4222-8222-222222222222',
      },
    });

    expect(result.success).toBe(true);
  });
});
