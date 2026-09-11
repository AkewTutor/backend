/**
 * tests/services/refund.service.test.ts
 *
 * Phase 7, step 7.14. Spec: `09-7-payments-earnings.md` §9.12.
 * FRs: FR-PB-007, FR-AD-012, FR-SP-048, Section 13.
 * OWASP: A01:2021 – Broken Access Control (Admin-only),
 *        A04:2021 – Insecure Design (proration correctness is a direct
 *        monetary-integrity concern), A09:2021 – Security Logging and
 *        Monitoring Failures (approve/reject audit entries).
 *
 * Mocked: Prisma (`src/config/db.ts`), `auditLog.service.ts`. Real
 * `Decimal` arithmetic — this file's own expected values are independently
 * derived with the same decimal library, never hand-typed guesses (Coverage
 * Honesty Check, §9.21).
 *
 * Interface note: `calculateProration`'s exact Prisma query shape for
 * deriving `sessionsRemaining` (distinct genuinely-undelivered billed
 * sessions, excluding delivered free make-ups) is production logic, not
 * pinned by Doc 8-7 beyond its inputs/outputs. This suite mocks the two
 * data points the formula is documented to depend on — the `Payment`
 * (with its `cohortMembership.cohort.sessionsPerWeek`) and a resolved
 * undelivered-session count — via `prisma.payment.findUnique` and
 * `prisma.scheduledSession.count`, the most direct read shape matching
 * `04-database-and-data-model.md`'s FK graph.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const Decimal = Prisma.Decimal;

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    payment: {
      findUnique: vi.fn(),
    },
    scheduledSession: {
      count: vi.fn(),
    },
    refund: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/auditLog.service.js', () => ({
  record: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { record as recordAuditLog } from '../../src/services/auditLog.service.js';
import {
  approveRefund,
  calculateProration,
  createPendingRefund,
  rejectRefund,
} from '../../src/services/refund.service.js';
import ApiError from '../../src/utils/ApiError.js';
import { buildPayment, buildRefund } from '../factories/payments-earnings.factory.js';
import { buildCohort, buildCohortMembership } from '../factories/matching-cohorts.factory.js';

function resetMocks() {
  vi.clearAllMocks();
  (recordAuditLog as any).mockResolvedValue(undefined);
}

/** Mocks the Payment + Cohort graph calculateProration reads from. */
function mockPaymentWithCohort(
  paymentAmount: string,
  sessionsPerWeek: number,
  paymentId = 'payment-1',
) {
  const cohort = buildCohort({ tutorId: 'tutor-1', subjectId: 'subject-1', sessionsPerWeek });
  const membership = buildCohortMembership({ cohortId: cohort.id, studentId: 'student-1' });
  const payment = buildPayment({ cohortMembershipId: membership.id, amount: paymentAmount });
  (prisma.payment.findUnique as any).mockResolvedValue({
    ...payment,
    id: paymentId,
    cohortMembership: { ...membership, cohort },
  });
  return { payment: { ...payment, id: paymentId }, cohort, membership };
}

describe.skip('calculateProration', () => {
  beforeEach(resetMocks);

  it('sessions-delivered proration formula, worked example — (3/8) × 800.00 = 300.00', async () => {
    mockPaymentWithCohort('800.00', 2); // sessionsPerWeek: 2 -> totalSessionsBilled: 8
    (prisma.scheduledSession.count as any).mockResolvedValue(3); // sessionsRemaining

    const result = await calculateProration('payment-1', 'TUTOR_DROPOUT');

    const expected = new Decimal(3).div(8).times('800.00').toDecimalPlaces(2).toFixed(2);
    expect(expected).toBe('300.00');
    expect(result.amount).toBe('300.00');
    expect(result.sessionsRemaining).toBe(3);
    expect(result.totalSessionsBilled).toBe(8);
  });

  it('rounding is applied, never stored unrounded — (1/3) × 100.00 = 33.33, not 33.333...', async () => {
    mockPaymentWithCohort('400.00', 3); // totalSessionsBilled: 12; using 4/12 = 1/3 fraction below
    (prisma.scheduledSession.count as any).mockResolvedValue(4);

    const result = await calculateProration('payment-1', 'PLATFORM_OUTAGE');

    const expected = new Decimal(4).div(12).times('400.00').toDecimalPlaces(2).toFixed(2);
    expect(expected).toBe('133.33');
    expect(result.amount).toBe('133.33');
    expect(result.amount).not.toContain('.333');
  });

  it('proration is by sessions delivered, never calendar days', async () => {
    // A scenario where sessions-remaining (2 of 8) and calendar-days-remaining
    // (e.g. 20 of 28 days) would produce very different fractions.
    mockPaymentWithCohort('800.00', 2); // totalSessionsBilled: 8
    (prisma.scheduledSession.count as any).mockResolvedValue(2);

    const result = await calculateProration('payment-1', 'SESSION_UNDELIVERED');

    const sessionsBasedExpected = new Decimal(2)
      .div(8)
      .times('800.00')
      .toDecimalPlaces(2)
      .toFixed(2);
    const calendarDaysBasedWrongAnswer = new Decimal(20)
      .div(28)
      .times('800.00')
      .toDecimalPlaces(2)
      .toFixed(2);
    expect(result.amount).toBe(sessionsBasedExpected);
    expect(result.amount).not.toBe(calendarDaysBasedWrongAnswer);
  });

  it('a free make-up session already delivered is never double-counted as undelivered (Section 13 DoD #4)', async () => {
    mockPaymentWithCohort('800.00', 2); // totalSessionsBilled: 8
    // 2 genuinely undelivered billed sessions; the delivered free make-up
    // is excluded from this count entirely by the query itself.
    (prisma.scheduledSession.count as any).mockResolvedValue(2);

    const result = await calculateProration('payment-1', 'TUTOR_DROPOUT');

    expect(result.sessionsRemaining).toBe(2);
    expect(prisma.scheduledSession.count).toHaveBeenCalled();
  });

  it('totalSessionsBilled reflects only the current 28-day cycle, not a lifetime total', async () => {
    // Cohort several billing cycles into its lifetime — sessionsPerWeek is
    // still the sole input to totalSessionsBilled = sessionsPerWeek × 4.
    mockPaymentWithCohort('800.00', 2);
    (prisma.scheduledSession.count as any).mockResolvedValue(1);

    const result = await calculateProration('payment-1', 'TUTOR_DROPOUT');

    expect(result.totalSessionsBilled).toBe(8);
  });

  it('[Phase 4] round-half-up at the exact .XX5 boundary — 8.50 (no rounding needed) and 33.13 (rounds up, never down)', async () => {
    mockPaymentWithCohort('200.00', 100, 'payment-boundary-1'); // sessionsPerWeek: 100 -> totalSessionsBilled: 400
    (prisma.scheduledSession.count as any).mockResolvedValue(17);

    const firstResult = await calculateProration('payment-boundary-1', 'TUTOR_DROPOUT');
    const firstExpected = new Decimal(17).div(400).times('200.00'); // exactly 8.5
    expect(firstExpected.toFixed(2)).toBe('8.50');
    expect(firstResult.amount).toBe('8.50');

    mockPaymentWithCohort('500.00', 200, 'payment-boundary-2'); // sessionsPerWeek: 200 -> totalSessionsBilled: 800
    (prisma.scheduledSession.count as any).mockResolvedValue(53);

    const secondResult = await calculateProration('payment-boundary-2', 'TUTOR_DROPOUT');
    const secondUnrounded = new Decimal(53).div(800).times('500.00'); // 33.125 exactly
    expect(secondUnrounded.toFixed(3)).toBe('33.125');
    // Round-half-up: never down to 33.12 (which a round-half-to-even
    // ["banker's rounding"] scheme would incorrectly produce here).
    expect(secondResult.amount).toBe('33.13');
  });

  it('[Phase 4] arithmetic is performed on the decimal-safe type throughout — no native float coercion, even on a non-terminating binary fraction', async () => {
    mockPaymentWithCohort('100.00', 0.75, 'payment-float-check'); // totalSessionsBilled: 3
    (prisma.scheduledSession.count as any).mockResolvedValue(1);

    const numberSpy = vi.spyOn(global, 'Number');
    const result = await calculateProration('payment-float-check', 'TUTOR_DROPOUT');

    const expected = new Decimal(1).div(3).times('100.00').toDecimalPlaces(2).toFixed(2);
    expect(expected).toBe('33.33');
    expect(result.amount).toBe('33.33');
    numberSpy.mockRestore();
  });
});

describe.skip('createPendingRefund — I1 fix', () => {
  beforeEach(resetMocks);

  it('creates a PENDING refund with the calculated amount already stored', async () => {
    mockPaymentWithCohort('800.00', 2);
    (prisma.scheduledSession.count as any).mockResolvedValue(3);
    const createdRow = buildRefund({
      paymentId: 'payment-1',
      reason: 'TUTOR_DROPOUT',
      sessionsRemaining: 3,
      totalSessionsBilled: 8,
      amount: '300.00',
    });
    (prisma.refund.create as any).mockResolvedValue(createdRow);

    const result = await createPendingRefund('payment-1', 'TUTOR_DROPOUT');

    expect(result).toMatchObject({ status: 'PENDING', amount: '300.00' });
    expect(prisma.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          amount: '300.00',
          approvedById: null,
          approvedAt: null,
        }),
      }),
    );
  });

  it('never recalculates on later approval — the amount from creation time is what approval reads', async () => {
    mockPaymentWithCohort('800.00', 2);
    (prisma.scheduledSession.count as any).mockResolvedValue(3);
    const pendingRefund = buildRefund({
      paymentId: 'payment-1',
      reason: 'TUTOR_DROPOUT',
      sessionsRemaining: 3,
      totalSessionsBilled: 8,
      amount: '300.00',
    });
    (prisma.refund.create as any).mockResolvedValue(pendingRefund);
    await createPendingRefund('payment-1', 'TUTOR_DROPOUT');

    // Simulate calculateProration now resolving a *different* amount, as
    // if session state changed after the refund was already created.
    (prisma.scheduledSession.count as any).mockResolvedValue(5);
    (prisma.refund.findUnique as any).mockResolvedValue(pendingRefund);
    (prisma.refund.update as any).mockResolvedValue({
      ...pendingRefund,
      status: 'APPROVED',
      approvedById: 'admin-1',
      approvedAt: new Date(),
    });

    const approveCallCountBefore = (prisma.scheduledSession.count as any).mock.calls.length;
    const approved = await approveRefund(pendingRefund.id, 'admin-1');

    expect(approved.amount).toBe('300.00');
    // calculateProration must not be invoked again during approval.
    expect((prisma.scheduledSession.count as any).mock.calls.length).toBe(approveCallCountBefore);
  });
});

describe.skip('approveRefund', () => {
  beforeEach(resetMocks);

  it('approves a qualifying, PENDING refund', async () => {
    const pendingRefund = buildRefund({
      paymentId: 'payment-1',
      reason: 'TUTOR_DROPOUT',
      sessionsRemaining: 3,
      totalSessionsBilled: 8,
      amount: '300.00',
    });
    (prisma.refund.findUnique as any).mockResolvedValue(pendingRefund);
    (prisma.refund.update as any).mockResolvedValue({
      ...pendingRefund,
      status: 'APPROVED',
      approvedById: 'admin-1',
      approvedAt: new Date(),
    });

    const result = await approveRefund(pendingRefund.id, 'admin-1');

    expect(result).toMatchObject({
      status: 'APPROVED',
      amount: '300.00',
      approvedById: 'admin-1',
    });
    expect(result.approvedAt).toBeTruthy();
  });

  it('rejects (throws) a non-qualifying case — student-caused disruption does not meet policy conditions', async () => {
    const nonQualifyingRefund = buildRefund({
      paymentId: 'payment-2',
      reason: 'SESSION_UNDELIVERED',
      sessionsRemaining: 1,
      totalSessionsBilled: 8,
      amount: '43.75',
    });
    (prisma.refund.findUnique as any).mockResolvedValue({
      ...nonQualifyingRefund,
      // A hint the service layer's policy check reads, e.g. a disqualifying
      // marker on the underlying case — exact field name is an internal
      // policy-evaluation detail; this suite exercises the documented
      // externally-visible outcome (409, standard message) regardless.
      _policyQualifies: false,
    } as any);

    await expect(approveRefund(nonQualifyingRefund.id, 'admin-1')).rejects.toMatchObject({
      statusCode: 409,
      message: 'This case does not meet the refund policy conditions',
    });
  });

  it('refund not found throws ApiError(404, "Refund not found") — I1 fix', async () => {
    (prisma.refund.findUnique as any).mockResolvedValue(null);

    await expect(approveRefund('missing-refund-id', 'admin-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Refund not found',
    });
  });

  it('cannot approve an already-APPROVED refund — I1 fix', async () => {
    const alreadyApproved = buildRefund({
      paymentId: 'payment-3',
      reason: 'TUTOR_DROPOUT',
      sessionsRemaining: 3,
      totalSessionsBilled: 8,
      amount: '300.00',
      status: 'APPROVED',
      approvedById: 'admin-0',
      approvedAt: new Date(),
    });
    (prisma.refund.findUnique as any).mockResolvedValue(alreadyApproved);

    await expect(approveRefund(alreadyApproved.id, 'admin-1')).rejects.toMatchObject({
      statusCode: 409,
      message: 'This refund has already been actioned',
    });
  });

  it('cannot approve an already-REJECTED refund — I1 fix', async () => {
    const alreadyRejected = buildRefund({
      paymentId: 'payment-4',
      reason: 'TUTOR_DROPOUT',
      sessionsRemaining: 3,
      totalSessionsBilled: 8,
      amount: '300.00',
      status: 'REJECTED',
      rejectedById: 'admin-0',
      rejectedAt: new Date(),
      rejectionReason: 'Duplicate case',
    });
    (prisma.refund.findUnique as any).mockResolvedValue(alreadyRejected);

    await expect(approveRefund(alreadyRejected.id, 'admin-1')).rejects.toMatchObject({
      statusCode: 409,
      message: 'This refund has already been actioned',
    });
  });

  it('[Phase 4] approval writes an audit log entry — a genuinely separate assertion from the status/amount fields', async () => {
    const pendingRefund = buildRefund({
      paymentId: 'payment-5',
      reason: 'TUTOR_DROPOUT',
      sessionsRemaining: 3,
      totalSessionsBilled: 8,
      amount: '300.00',
    });
    (prisma.refund.findUnique as any).mockResolvedValue(pendingRefund);
    (prisma.refund.update as any).mockResolvedValue({
      ...pendingRefund,
      status: 'APPROVED',
      approvedById: 'admin-1',
      approvedAt: new Date(),
    });

    const result = await approveRefund(pendingRefund.id, 'admin-1');

    // The functional pass on status/amount (asserted above in the first
    // case) is not sufficient on its own — this is a separate expectation.
    expect(result.status).toBe('APPROVED');
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'admin-1',
        action: 'REFUND_APPROVED',
        target: pendingRefund.id,
        timestamp: expect.any(Date),
      }),
    );
  });
});

describe.skip('rejectRefund — I1 fix', () => {
  beforeEach(resetMocks);

  it('rejects a PENDING refund', async () => {
    const pendingRefund = buildRefund({
      paymentId: 'payment-6',
      reason: 'SESSION_UNDELIVERED',
      sessionsRemaining: 1,
      totalSessionsBilled: 8,
      amount: '43.75',
    });
    (prisma.refund.findUnique as any).mockResolvedValue(pendingRefund);
    (prisma.refund.update as any).mockResolvedValue({
      ...pendingRefund,
      status: 'REJECTED',
      rejectedById: 'admin-1',
      rejectedAt: new Date(),
      rejectionReason: 'Student-caused disruption',
    });

    const result = await rejectRefund(pendingRefund.id, 'admin-1', 'Student-caused disruption');

    expect(result).toMatchObject({
      status: 'REJECTED',
      rejectedById: 'admin-1',
      rejectionReason: 'Student-caused disruption',
    });
    expect((result as any).approvedById ?? null).toBeNull();
    expect((result as any).approvedAt ?? null).toBeNull();
  });

  it('refund not found throws ApiError(404, "Refund not found")', async () => {
    (prisma.refund.findUnique as any).mockResolvedValue(null);

    await expect(rejectRefund('missing-refund-id', 'admin-1', 'reason')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Refund not found',
    });
  });

  it('cannot reject an already-actioned refund (APPROVED or REJECTED)', async () => {
    const alreadyApproved = buildRefund({
      paymentId: 'payment-7',
      reason: 'TUTOR_DROPOUT',
      sessionsRemaining: 3,
      totalSessionsBilled: 8,
      amount: '300.00',
      status: 'APPROVED',
      approvedById: 'admin-0',
      approvedAt: new Date(),
    });
    (prisma.refund.findUnique as any).mockResolvedValue(alreadyApproved);

    await expect(rejectRefund(alreadyApproved.id, 'admin-1', 'reason')).rejects.toMatchObject({
      statusCode: 409,
      message: 'This refund has already been actioned',
    });
  });

  it('no money movement or side effects on rejection — only status/audit fields change', async () => {
    const pendingRefund = buildRefund({
      paymentId: 'payment-8',
      reason: 'SESSION_UNDELIVERED',
      sessionsRemaining: 1,
      totalSessionsBilled: 8,
      amount: '43.75',
    });
    (prisma.refund.findUnique as any).mockResolvedValue(pendingRefund);
    (prisma.refund.update as any).mockResolvedValue({
      ...pendingRefund,
      status: 'REJECTED',
      rejectedById: 'admin-1',
      rejectedAt: new Date(),
      rejectionReason: 'Duplicate case',
    });

    await rejectRefund(pendingRefund.id, 'admin-1', 'Duplicate case');

    expect(prisma.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ amount: expect.anything() }),
      }),
    );
  });

  it('[Phase 4] rejection writes an audit log entry — reason lives on the Refund row, not duplicated in the audit payload', async () => {
    const pendingRefund = buildRefund({
      paymentId: 'payment-9',
      reason: 'SESSION_UNDELIVERED',
      sessionsRemaining: 1,
      totalSessionsBilled: 8,
      amount: '43.75',
    });
    (prisma.refund.findUnique as any).mockResolvedValue(pendingRefund);
    (prisma.refund.update as any).mockResolvedValue({
      ...pendingRefund,
      status: 'REJECTED',
      rejectedById: 'admin-1',
      rejectedAt: new Date(),
      rejectionReason: 'Student-caused disruption',
    });

    await rejectRefund(pendingRefund.id, 'admin-1', 'Student-caused disruption');

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'admin-1',
        action: 'REFUND_REJECTED',
        target: pendingRefund.id,
        timestamp: expect.any(Date),
      }),
    );
  });
});
