/**
 * tests/schemas/complaint.schema.test.ts
 *
 * Journey step 8.1. Spec: `09-8-support-trust-admin.md` §9.2.
 * FRs: FR-AD-017, complaint intake shape.
 *
 * Pure Zod parsing — nothing mocked. `createComplaintSchema` and
 * `resolveDisputeSchema` per `08-function-level-specification/backend/8-8`.
 */

import { describe, expect, it } from 'vitest';

import { createComplaintSchema, resolveDisputeSchema } from '../../src/schemas/complaint.schema.js';

describe.skip('createComplaintSchema', () => {
  it('requires a related entity unless category is OTHER', () => {
    const result = createComplaintSchema.safeParse({
      body: {
        category: 'TUTOR_CONDUCT',
        description: '10+ chars here',
        relatedCohortId: undefined,
        relatedSessionId: undefined,
        relatedPaymentId: undefined,
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i: { message: string }) => i.message);
      expect(messages).toContain(
        'A complaint must reference a session, payment, or cohort unless filed as a general (OTHER) report',
      );
    }
  });

  it('OTHER category needs no related entity', () => {
    const result = createComplaintSchema.safeParse({
      body: { category: 'OTHER', description: '10+ chars here' },
    });

    expect(result.success).toBe(true);
  });

  it('description length bounds — rejects a 9-char description', () => {
    const result = createComplaintSchema.safeParse({
      body: { category: 'OTHER', description: '123456789' },
    });

    expect(result.success).toBe(false);
  });

  it('description length bounds — rejects a 2001-char description', () => {
    const result = createComplaintSchema.safeParse({
      body: { category: 'OTHER', description: 'x'.repeat(2001) },
    });

    expect(result.success).toBe(false);
  });

  it('description length bounds — accepts a description within 10-2000 chars', () => {
    const result = createComplaintSchema.safeParse({
      body: { category: 'OTHER', description: 'x'.repeat(50) },
    });

    expect(result.success).toBe(true);
  });
});

describe.skip('resolveDisputeSchema', () => {
  const uuid = '11111111-1111-1111-1111-111111111111';

  it('requires a resolutionAction when resolving', () => {
    const result = resolveDisputeSchema.safeParse({
      body: { status: 'RESOLVED', resolutionNotes: 'note' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i: { message: string }) => i.message);
      expect(messages).toContain('A resolution action is required to resolve a complaint');
    }
  });

  it('requires affectedCohortMembershipId for REFUND_ISSUED', () => {
    const result = resolveDisputeSchema.safeParse({
      body: { status: 'RESOLVED', resolutionAction: 'REFUND_ISSUED', resolutionNotes: 'note' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i: { message: string }) => i.message);
      expect(messages).toContain(
        'affectedCohortMembershipId is required for this resolution action',
      );
    }
  });

  it('has no refundAmount field (H4 fix, mass-assignment guard) — an unknown refundAmount key is stripped', () => {
    const result = resolveDisputeSchema.safeParse({
      body: {
        status: 'RESOLVED',
        resolutionAction: 'REFUND_ISSUED',
        affectedCohortMembershipId: uuid,
        resolutionNotes: 'note',
        refundAmount: '9999.99',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data.body as Record<string, unknown>).refundAmount).toBeUndefined();
    }
  });

  it('DISMISSED does not require a resolutionAction', () => {
    const result = resolveDisputeSchema.safeParse({
      body: { status: 'DISMISSED', resolutionNotes: 'note' },
    });

    expect(result.success).toBe(true);
  });

  it('UNDER_REVIEW does not require a resolutionAction', () => {
    const result = resolveDisputeSchema.safeParse({
      body: { status: 'UNDER_REVIEW', resolutionNotes: 'note' },
    });

    expect(result.success).toBe(true);
  });

  it('resolutionNotes is required — rejects an empty string', () => {
    const result = resolveDisputeSchema.safeParse({
      body: { status: 'DISMISSED', resolutionNotes: '' },
    });

    expect(result.success).toBe(false);
  });
});
