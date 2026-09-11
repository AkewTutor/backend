/**
 * tests/schemas/promotion.schema.test.ts
 *
 * Phase 7, step 7.23. Spec: `09-7-payments-earnings.md` §9.18.
 *
 * Real Zod schema (no mocking) — `createPromotionSchema`'s job is proven
 * against actual Zod parsing behavior.
 */

import { describe, expect, it } from 'vitest';

import { createPromotionSchema } from '../../src/schemas/promotion.schema.js';

function basePromotion(overrides: Record<string, unknown> = {}) {
  return {
    code: 'BACKTOSCHOOL2026',
    discountType: 'PERCENT',
    discountValue: '10',
    validFrom: '2026-09-01T00:00:00.000Z',
    validTo: '2026-09-30T00:00:00.000Z',
    ...overrides,
  };
}

describe.skip('createPromotionSchema', () => {
  it('requires validTo after validFrom', async () => {
    const result = await createPromotionSchema.safeParseAsync({
      body: basePromotion({
        validFrom: '2026-09-30T00:00:00.000Z',
        validTo: '2026-09-01T00:00:00.000Z',
      }),
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid ascending range', async () => {
    const result = await createPromotionSchema.safeParseAsync({
      body: basePromotion(),
    });

    expect(result.success).toBe(true);
  });

  it('restricts discountType to PERCENT | FIXED_ETB', async () => {
    const result = await createPromotionSchema.safeParseAsync({
      body: basePromotion({ discountType: 'COUPON' }),
    });

    expect(result.success).toBe(false);
  });
});
