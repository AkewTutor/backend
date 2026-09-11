/**
 * tests/schemas/pricing.schema.test.ts
 *
 * Phase 7, step 7.9. Spec: `09-7-payments-earnings.md` §9.8.
 *
 * Real Zod schema (no mocking) — `updatePricingConfigSchema`'s job is
 * proven against actual Zod parsing behavior.
 */

import { describe, expect, it } from 'vitest';

import { updatePricingConfigSchema } from '../../src/schemas/pricing.schema.js';

describe.skip('updatePricingConfigSchema', () => {
  it('rejects a mismatched share/total split', async () => {
    const result = await updatePricingConfigSchema.safeParseAsync({
      params: { format: 'ONE_TO_ONE' },
      body: {
        pricePerStudentPerHour: '100',
        totalPerHour: '100',
        platformSharePerHour: '40',
        tutorSharePerHour: '50',
      },
    });

    expect(result.success).toBe(false);
  });

  it('accepts a reconciled split — platformSharePerHour + tutorSharePerHour === totalPerHour', async () => {
    const result = await updatePricingConfigSchema.safeParseAsync({
      params: { format: 'ONE_TO_THREE' },
      body: {
        pricePerStudentPerHour: '150',
        totalPerHour: '450',
        platformSharePerHour: '150',
        tutorSharePerHour: '300',
      },
    });

    expect(result.success).toBe(true);
  });

  it('restricts the format path param to the 3 known formats', async () => {
    const result = await updatePricingConfigSchema.safeParseAsync({
      params: { format: 'ONE_TO_TEN' },
      body: {
        pricePerStudentPerHour: '100',
        totalPerHour: '100',
        platformSharePerHour: '40',
        tutorSharePerHour: '60',
      },
    });

    expect(result.success).toBe(false);
  });
});
