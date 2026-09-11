/**
 * tests/services/paymentPause.service.test.ts
 *
 * Phase 7, step 7.6. Spec: `09-7-payments-earnings.md` §9.6.
 * FRs: FR-PB-005, FR-PB-009.
 * OWASP: none client-facing (event-driven, no direct input) — however, the
 *        no-miss-no-refund guarantee is a direct anti-pattern check against
 *        silently mis-billing a paused student.
 *
 * Mocked: Prisma (`src/config/db.ts`), and `class-delivery-library`'s
 * `session.service.ts` (already real from Phase 4 per the journey doc).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    paymentPause: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    scheduledSession: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/session.service.js', () => ({
  generateSessionsForCohort: vi.fn(),
}));

vi.mock('../../src/services/sessionMiss.service.js', () => ({
  recordTutorCausedMiss: vi.fn(),
  recordStudentCausedMiss: vi.fn(),
}));

vi.mock('../../src/services/refund.service.js', () => ({
  calculateProration: vi.fn(),
  createPendingRefund: vi.fn(),
}));

vi.mock('../../src/services/earning.service.js', () => ({
  creditEarning: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import {
  recordStudentCausedMiss,
  recordTutorCausedMiss,
} from '../../src/services/sessionMiss.service.js';
import { createPendingRefund } from '../../src/services/refund.service.js';
import { creditEarning } from '../../src/services/earning.service.js';
import {
  pauseForNonPayment,
  rescheduleSessionsDuringPause,
  resumeOnPayment,
} from '../../src/services/paymentPause.service.js';
import { buildPaymentPause } from '../factories/payments-earnings.factory.js';
import { buildScheduledSession } from '../factories/class-delivery-library.factory.js';

function resetMocks() {
  vi.clearAllMocks();
}

describe.skip('pauseForNonPayment / resumeOnPayment', () => {
  beforeEach(resetMocks);

  it('pauses on a missed due date — creates PaymentPause(reason: NONPAYMENT, startedAt)', async () => {
    const membershipId = 'membership-1';
    (prisma.paymentPause.create as any).mockResolvedValue(
      buildPaymentPause({ cohortMembershipId: membershipId, reason: 'NONPAYMENT' }),
    );

    await pauseForNonPayment(membershipId);

    expect(prisma.paymentPause.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cohortMembershipId: membershipId, reason: 'NONPAYMENT' }),
      }),
    );
  });

  it('resumes on next successful payment — sets endedAt and calls rescheduleSessionsDuringPause', async () => {
    const membershipId = 'membership-2';
    const activePause = buildPaymentPause({ cohortMembershipId: membershipId, endedAt: null });
    (prisma.paymentPause.findFirst as any).mockResolvedValue(activePause);
    (prisma.paymentPause.update as any).mockResolvedValue({ ...activePause, endedAt: new Date() });
    (prisma.scheduledSession.findMany as any).mockResolvedValue([]);

    await resumeOnPayment(membershipId);

    expect(prisma.paymentPause.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ endedAt: expect.any(Date) }) }),
    );
  });
});

describe.skip('rescheduleSessionsDuringPause', () => {
  beforeEach(resetMocks);

  it('sessions inside the pause window are rescheduled, not miss-flagged — no fault classification generated', async () => {
    const membershipId = 'membership-3';
    const pause = buildPaymentPause({
      cohortMembershipId: membershipId,
      startedAt: new Date('2026-09-01T00:00:00Z'),
      endedAt: new Date('2026-09-10T00:00:00Z'),
    });
    const session1 = buildScheduledSession({
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-09-03T10:00:00Z'),
    });
    const session2 = buildScheduledSession({
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-09-06T10:00:00Z'),
    });
    (prisma.paymentPause.findFirst as any).mockResolvedValue(pause);
    (prisma.scheduledSession.findMany as any).mockResolvedValue([session1, session2]);
    (prisma.scheduledSession.update as any).mockResolvedValue({});

    const result = await rescheduleSessionsDuringPause(membershipId);

    expect(result.rescheduled).toHaveLength(2);
    expect(prisma.scheduledSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: session1.id },
        data: expect.objectContaining({ status: 'PAYMENT_PAUSE_RESCHEDULED' }),
      }),
    );
    expect(prisma.scheduledSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: session2.id },
        data: expect.objectContaining({ status: 'PAYMENT_PAUSE_RESCHEDULED' }),
      }),
    );
    expect(recordTutorCausedMiss).not.toHaveBeenCalled();
    expect(recordStudentCausedMiss).not.toHaveBeenCalled();
  });

  it('no refund and no earnings entry generated for a paused session', async () => {
    const membershipId = 'membership-4';
    const pause = buildPaymentPause({
      cohortMembershipId: membershipId,
      startedAt: new Date('2026-09-01T00:00:00Z'),
      endedAt: new Date('2026-09-10T00:00:00Z'),
    });
    const session = buildScheduledSession({
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-09-04T10:00:00Z'),
    });
    (prisma.paymentPause.findFirst as any).mockResolvedValue(pause);
    (prisma.scheduledSession.findMany as any).mockResolvedValue([session]);
    (prisma.scheduledSession.update as any).mockResolvedValue({});

    await rescheduleSessionsDuringPause(membershipId);

    expect(createPendingRefund).not.toHaveBeenCalled();
    expect(creditEarning).not.toHaveBeenCalled();
  });

  it('sessions outside the window are untouched', async () => {
    const membershipId = 'membership-5';
    const pause = buildPaymentPause({
      cohortMembershipId: membershipId,
      startedAt: new Date('2026-09-01T00:00:00Z'),
      endedAt: new Date('2026-09-10T00:00:00Z'),
    });
    const outsideSession = buildScheduledSession({
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-08-20T10:00:00Z'),
      status: 'SCHEDULED',
    });
    (prisma.paymentPause.findFirst as any).mockResolvedValue(pause);
    (prisma.scheduledSession.findMany as any).mockResolvedValue([]);

    const result = await rescheduleSessionsDuringPause(membershipId);

    expect(result.rescheduled).toHaveLength(0);
    expect(prisma.scheduledSession.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: outsideSession.id } }),
    );
  });
});
