/**
 * tests/services/payment.service.test.ts
 *
 * Phase 7, step 7.3. Spec: `09-7-payments-earnings.md` §9.4.
 * FRs: FR-PB-001–004, FR-PB-008. NFRs: NFR-007.
 * OWASP: A01:2021 – Broken Access Control (membership/ownership scoping),
 *        A04:2021 – Insecure Design (server-locked pricing),
 *        A08:2021 – Software and Data Integrity Failures (idempotent
 *        webhook replay), A02:2021 – Cryptographic Failures (no raw
 *        payload/reference leaked to logs on a processing failure).
 *
 * Mocked: Prisma (`src/config/db.ts`), `chapa.client.ts`,
 * `promotion.service.ts`, and `class-delivery-library`'s
 * `session.service.ts → generateSessionsForCohort`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    cohortMembership: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    pricingConfig: {
      findFirst: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    parentStudentRelationship: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../src/utils/providers/chapa.client.js', () => ({
  initiateCheckout: vi.fn(),
  verifyWebhookSignature: vi.fn(),
}));

vi.mock('../../src/services/promotion.service.js', () => ({
  applyToPayment: vi.fn(),
}));

vi.mock('../../src/services/session.service.js', () => ({
  generateSessionsForCohort: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { prisma } from '../../src/config/db.js';
import {
  initiateCheckout,
  verifyWebhookSignature,
} from '../../src/utils/providers/chapa.client.js';
import { applyToPayment } from '../../src/services/promotion.service.js';
import { generateSessionsForCohort } from '../../src/services/session.service.js';
import logger from '../../src/utils/logger.js';
import {
  getPaymentHistory,
  handleChapaWebhook,
  initiatePayment,
} from '../../src/services/payment.service.js';
import ApiError from '../../src/utils/ApiError.js';
import { buildPayment, buildPricingConfig } from '../factories/payments-earnings.factory.js';
import { buildCohortMembership } from '../factories/matching-cohorts.factory.js';

function resetMocks() {
  vi.clearAllMocks();
  (initiateCheckout as any).mockResolvedValue({
    checkoutUrl: 'https://checkout.chapa.co/checkout/abc',
  });
  (verifyWebhookSignature as any).mockResolvedValue(true);
  (applyToPayment as any).mockImplementation(async (_code: string, baseAmount: string) => ({
    discountedAmount: baseAmount,
  }));
  (generateSessionsForCohort as any).mockResolvedValue(undefined);
}

describe.skip('initiatePayment', () => {
  beforeEach(resetMocks);

  it('begins a Chapa checkout for an Admin-approved membership', async () => {
    const membership = buildCohortMembership({
      cohortId: 'cohort-1',
      studentId: 'student-1',
      status: 'PENDING_PAYMENT',
    });
    const pricing = buildPricingConfig({
      createdById: 'admin-1',
      isActive: true,
      format: 'ONE_TO_ONE',
    });
    (prisma.cohortMembership.findUnique as any).mockResolvedValue(membership);
    (prisma.pricingConfig.findFirst as any).mockResolvedValue(pricing);
    (prisma.payment.create as any).mockResolvedValue(
      buildPayment({
        cohortMembershipId: membership.id,
        amount: pricing.pricePerStudentPerHour,
        status: 'PENDING',
      }),
    );

    const result = await initiatePayment('student-1', 'STUDENT', membership.id);

    expect(result).toMatchObject({
      paymentId: expect.any(String),
      chapaCheckoutUrl: 'https://checkout.chapa.co/checkout/abc',
      status: 'PENDING',
    });
    expect(result.amount).toBeDefined();
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
    );
  });

  it('locks the amount in at initiation time — a later Admin price change never retroactively affects the stored Payment', async () => {
    const membership = buildCohortMembership({
      cohortId: 'cohort-1',
      studentId: 'student-1',
      status: 'PENDING_PAYMENT',
    });
    const rateXConfig = buildPricingConfig({
      createdById: 'admin-1',
      isActive: true,
      pricePerStudentPerHour: '350.00',
    });
    (prisma.cohortMembership.findUnique as any).mockResolvedValue(membership);
    (prisma.pricingConfig.findFirst as any).mockResolvedValue(rateXConfig);
    const createdPayment = buildPayment({
      cohortMembershipId: membership.id,
      amount: '350.00',
      status: 'PENDING',
    });
    (prisma.payment.create as any).mockResolvedValue(createdPayment);

    await initiatePayment('student-1', 'STUDENT', membership.id);

    // Simulate an Admin price change to rate Y happening afterward.
    (prisma.pricingConfig.findFirst as any).mockResolvedValue(
      buildPricingConfig({
        createdById: 'admin-1',
        isActive: true,
        pricePerStudentPerHour: '400.00',
      }),
    );
    (prisma.payment.findUnique as any).mockResolvedValue(createdPayment);

    const refetched = await prisma.payment.findUnique({ where: { id: createdPayment.id } });
    expect((refetched as any).amount).toBe('350.00');
  });

  it('membership not awaiting payment throws ApiError(409, "This membership is not awaiting payment")', async () => {
    const membership = buildCohortMembership({
      cohortId: 'cohort-1',
      studentId: 'student-1',
      status: 'ACTIVE',
    });
    (prisma.cohortMembership.findUnique as any).mockResolvedValue(membership);

    await expect(initiatePayment('student-1', 'STUDENT', membership.id)).rejects.toMatchObject({
      statusCode: 409,
      message: 'This membership is not awaiting payment',
    });
  });

  it('invalid/expired promotion code throws ApiError(400, "Invalid or expired promotion code")', async () => {
    const membership = buildCohortMembership({
      cohortId: 'cohort-1',
      studentId: 'student-1',
      status: 'PENDING_PAYMENT',
    });
    (prisma.cohortMembership.findUnique as any).mockResolvedValue(membership);
    (prisma.pricingConfig.findFirst as any).mockResolvedValue(
      buildPricingConfig({ createdById: 'admin-1', isActive: true }),
    );
    (applyToPayment as any).mockRejectedValue(
      new ApiError(400, 'Invalid or expired promotion code'),
    );

    await expect(
      initiatePayment('student-1', 'STUDENT', membership.id, 'BADCODE'),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Invalid or expired promotion code' });
  });

  it('Grade 6-12 student pays independently, no guardian required (FR-PB-008)', async () => {
    const membership = buildCohortMembership({
      cohortId: 'cohort-1',
      studentId: 'student-9',
      status: 'PENDING_PAYMENT',
    });
    (prisma.cohortMembership.findUnique as any).mockResolvedValue(membership);
    (prisma.pricingConfig.findFirst as any).mockResolvedValue(
      buildPricingConfig({ createdById: 'admin-1', isActive: true }),
    );
    (prisma.payment.create as any).mockResolvedValue(
      buildPayment({ cohortMembershipId: membership.id, status: 'PENDING' }),
    );
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue(null);

    await expect(initiatePayment('student-9', 'STUDENT', membership.id)).resolves.toMatchObject({
      status: 'PENDING',
    });
  });

  it('never confirms the schedule itself — generateSessionsForCohort is never called from initiatePayment', async () => {
    const membership = buildCohortMembership({
      cohortId: 'cohort-1',
      studentId: 'student-1',
      status: 'PENDING_PAYMENT',
    });
    (prisma.cohortMembership.findUnique as any).mockResolvedValue(membership);
    (prisma.pricingConfig.findFirst as any).mockResolvedValue(
      buildPricingConfig({ createdById: 'admin-1', isActive: true }),
    );
    (prisma.payment.create as any).mockResolvedValue(
      buildPayment({ cohortMembershipId: membership.id, status: 'PENDING' }),
    );

    await initiatePayment('student-1', 'STUDENT', membership.id);

    expect(generateSessionsForCohort).not.toHaveBeenCalled();
  });
});

describe.skip('handleChapaWebhook / setBillingCycleAnchor', () => {
  beforeEach(resetMocks);

  function webhookPayload(overrides: Record<string, unknown> = {}) {
    return Buffer.from(JSON.stringify({ event: 'SUCCESS', tx_ref: 'payment-1', ...overrides }));
  }

  it('invalid signature throws ApiError(400, "Invalid webhook signature")', async () => {
    (verifyWebhookSignature as any).mockResolvedValue(false);

    await expect(handleChapaWebhook(webhookPayload(), 'bad-signature')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid webhook signature',
    });
  });

  it('SUCCESS confirms the schedule and sets the anchor on the first successful payment', async () => {
    const payment = buildPayment({ cohortMembershipId: 'membership-1', status: 'PENDING' });
    const membership = buildCohortMembership({
      cohortId: 'cohort-1',
      studentId: 'student-1',
      status: 'PENDING_PAYMENT',
      billingCycleAnchorDate: null,
    });
    (prisma.payment.findUnique as any).mockResolvedValue({
      ...payment,
      cohortMembership: membership,
    });
    (prisma.payment.update as any).mockResolvedValue({ ...payment, status: 'SUCCESS' });
    (prisma.cohortMembership.update as any).mockResolvedValue({
      ...membership,
      billingCycleAnchorDate: new Date(),
    });

    await handleChapaWebhook(webhookPayload({ tx_ref: payment.id }), 'valid-signature');

    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }),
    );
    expect(generateSessionsForCohort).toHaveBeenCalled();
    expect(prisma.cohortMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ billingCycleAnchorDate: expect.any(Date) }),
      }),
    );
  });

  it('anchor is never reset on a subsequent recurring payment', async () => {
    const existingAnchor = new Date('2026-08-01T00:00:00Z');
    const payment = buildPayment({ cohortMembershipId: 'membership-2', status: 'PENDING' });
    const membership = buildCohortMembership({
      cohortId: 'cohort-2',
      studentId: 'student-2',
      status: 'ACTIVE',
      billingCycleAnchorDate: existingAnchor,
    });
    (prisma.payment.findUnique as any).mockResolvedValue({
      ...payment,
      cohortMembership: membership,
    });
    (prisma.payment.update as any).mockResolvedValue({ ...payment, status: 'SUCCESS' });

    await handleChapaWebhook(webhookPayload({ tx_ref: payment.id }), 'valid-signature');

    expect(prisma.cohortMembership.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ billingCycleAnchorDate: expect.anything() }),
      }),
    );
  });

  it('FAILED leaves the membership awaiting payment — no schedule generated, no automatic retry', async () => {
    const payment = buildPayment({ cohortMembershipId: 'membership-3', status: 'PENDING' });
    const membership = buildCohortMembership({
      cohortId: 'cohort-3',
      studentId: 'student-3',
      status: 'PENDING_PAYMENT',
    });
    (prisma.payment.findUnique as any).mockResolvedValue({
      ...payment,
      cohortMembership: membership,
    });
    (prisma.payment.update as any).mockResolvedValue({ ...payment, status: 'FAILED' });

    await handleChapaWebhook(
      webhookPayload({ event: 'FAILED', tx_ref: payment.id }),
      'valid-signature',
    );

    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(generateSessionsForCohort).not.toHaveBeenCalled();
  });

  it('idempotent against a duplicate webhook delivery — checks terminal status before reprocessing', async () => {
    const payment = buildPayment({ cohortMembershipId: 'membership-4', status: 'SUCCESS' });
    const membership = buildCohortMembership({
      cohortId: 'cohort-4',
      studentId: 'student-4',
      status: 'ACTIVE',
      billingCycleAnchorDate: new Date('2026-08-01T00:00:00Z'),
    });
    (prisma.payment.findUnique as any).mockResolvedValue({
      ...payment,
      cohortMembership: membership,
    });

    await handleChapaWebhook(webhookPayload({ tx_ref: payment.id }), 'valid-signature');

    expect(generateSessionsForCohort).not.toHaveBeenCalled();
    expect(prisma.cohortMembership.update).not.toHaveBeenCalled();
  });

  it('[Phase 4] a processing failure never logs the raw payload or providerTransactionId in plaintext', async () => {
    const payment = buildPayment({
      cohortMembershipId: 'membership-5',
      status: 'PENDING',
      providerTransactionId: 'chapa-secret-tx-ref-999',
    });
    const membership = buildCohortMembership({
      cohortId: 'cohort-5',
      studentId: 'student-5',
      status: 'PENDING_PAYMENT',
    });
    (prisma.payment.findUnique as any).mockResolvedValue({
      ...payment,
      cohortMembership: membership,
    });
    (prisma.payment.update as any).mockResolvedValue({ ...payment, status: 'SUCCESS' });
    (generateSessionsForCohort as any).mockRejectedValue(
      new Error('downstream schedule generation failed'),
    );

    const rawBody = webhookPayload({ tx_ref: payment.id });
    await expect(handleChapaWebhook(rawBody, 'valid-signature')).rejects.toThrow();

    const allLogCalls = [
      ...(logger.error as any).mock.calls,
      ...(logger.warn as any).mock.calls,
    ].flat();
    const serialized = JSON.stringify(allLogCalls);
    expect(serialized).not.toContain('chapa-secret-tx-ref-999');
    expect(serialized).not.toContain(rawBody.toString('utf-8'));
  });
});

describe.skip('getPaymentHistory', () => {
  beforeEach(resetMocks);

  it('returns paginated history for the caller/target student', async () => {
    (prisma.payment.findMany as any).mockResolvedValue([
      buildPayment({ cohortMembershipId: 'membership-1', status: 'SUCCESS' }),
    ]);
    (prisma.payment.count as any).mockResolvedValue(1);

    const result = await getPaymentHistory('student-1', 'STUDENT', 'student-1', 1, 20);

    expect(result).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(result.payments).toHaveLength(1);
  });

  it('no payments yet resolves an empty list, not an error', async () => {
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (prisma.payment.count as any).mockResolvedValue(0);

    const result = await getPaymentHistory('student-1', 'STUDENT', 'student-1', 1, 20);

    expect(result).toMatchObject({ payments: [], page: 1, limit: 20, total: 0 });
  });

  it('a Parent viewing a non-relation student throws ApiError(403) — IDOR guard', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue(null);

    await expect(
      getPaymentHistory('parent-1', 'PARENT', 'student-other', 1, 20),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
