/**
 * tests/schemas/library.schema.test.ts
 *
 * Journey step 4.13. Spec: `09-4-class-delivery-library.md` §9.11.
 * FRs: FR-CD-009.
 */

import { describe, expect, it } from 'vitest';

import { uploadMaterialSchema } from '../../src/schemas/library.schema.js';

const validCohortId = '11111111-1111-4111-8111-111111111111';

describe.skip('uploadMaterialSchema', () => {
  it('requires a valid fileType enum — VIDEO is rejected, only PDF/NOTE/BOOK allowed', () => {
    const result = uploadMaterialSchema.safeParse({
      body: { cohortId: validCohortId, title: 'Notes', fileType: 'VIDEO' },
    });

    expect(result.success).toBe(false);
  });

  it('requires a non-empty title', () => {
    const result = uploadMaterialSchema.safeParse({
      body: { cohortId: validCohortId, title: '', fileType: 'PDF' },
    });

    expect(result.success).toBe(false);
  });

  it('passes with a valid cohortId, non-empty title, and allowed fileType', () => {
    const result = uploadMaterialSchema.safeParse({
      body: { cohortId: validCohortId, title: 'Chapter 3 Notes', fileType: 'PDF' },
    });

    expect(result.success).toBe(true);
  });

  it.each(['PDF', 'NOTE', 'BOOK'])('accepts %s as a valid fileType', (fileType) => {
    const result = uploadMaterialSchema.safeParse({
      body: { cohortId: validCohortId, title: 'Notes', fileType },
    });

    expect(result.success).toBe(true);
  });
});
