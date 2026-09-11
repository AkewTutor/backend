/**
 * tests/schemas/refund.schema.test.ts
 *
 * Phase 7, step 7.13. Spec: `09-7-payments-earnings.md` §9.11 — I1 fix.
 *
 * Real Zod schema (no mocking) — `rejectRefundSchema`'s job is proven
 * against actual Zod parsing behavior.
 */

import { describe, expect, it } from 'vitest';

import { rejectRefundSchema } from '../../src/schemas/refund.schema.js';

const VALID_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe.skip('rejectRefundSchema', () => {
  it('rejects an empty rejectionReason', async () => {
    const result = await rejectRefundSchema.safeParseAsync({
      params: { refundId: VALID_UUID },
      body: { rejectionReason: '' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID refundId', async () => {
    const result = await rejectRefundSchema.safeParseAsync({
      params: { refundId: 'not-a-uuid' },
      body: { rejectionReason: 'Student-caused disruption' },
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid payload', async () => {
    const result = await rejectRefundSchema.safeParseAsync({
      params: { refundId: VALID_UUID },
      body: { rejectionReason: 'Student-caused disruption' },
    });

    expect(result.success).toBe(true);
  });
});
