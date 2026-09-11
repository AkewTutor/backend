/**
 * tests/services/formatSwitch.service.test.ts
 *
 * Journey step 3.12. Spec: `09-3-matching-cohorts.md` §9.10.
 * Function-level ref: `8-3-matching-cohorts.md` — src/services/formatSwitch.service.ts.
 * FRs: FR-SP-045–049.
 *
 * Unit tier — mocked `cohort.service.ts`, `matching.service.ts`,
 * `refund.service.ts` (per 9.1's Test File Map note: `refund.service.ts`
 * doesn't exist yet until Phase 7 — this mock is written now and
 * re-validated for shape drift once Phase 7 lands the real one).
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    cohortMembership: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
    },
    cohort: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/cohort.service.js', () => ({
  endCohort: vi.fn(),
}));

vi.mock('../../src/services/matching.service.js', () => ({
  selectTutor: vi.fn(),
  requestGroupFormat: vi.fn(),
  createMatchRequestForFormat: vi.fn(),
}));

vi.mock('../../src/services/refund.service.js', () => ({
  createPendingRefund: vi.fn(),
}));

vi.mock('../../src/services/notification.service.js', () => ({
  dispatchNotification: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import * as matchingService from '../../src/services/matching.service.js';
import * as refundService from '../../src/services/refund.service.js';
import { dispatchNotification } from '../../src/services/notification.service.js';
import { requestSwitch } from '../../src/services/formatSwitch.service.js';

const studentId = randomUUID();
const membershipId = randomUUID();
const cohortId = randomUUID();
const paymentId = randomUUID();

function activeMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: membershipId,
    cohortId,
    studentId,
    status: 'ACTIVE',
    cohort: { id: cohortId, format: 'ONE_TO_ONE' },
    ...overrides,
  };
}

function resetAllMocks() {
  vi.clearAllMocks();
  (dispatchNotification as any).mockResolvedValue(undefined);
  (prisma.cohortMembership.update as any).mockResolvedValue({ id: membershipId, status: 'ENDED' });
}

describe.skip('requestSwitch', () => {
  beforeEach(() => resetAllMocks());

  it('successful switch from 1-to-1 to 1-to-3', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(activeMembership());
    (prisma.payment.findFirst as any).mockResolvedValue({
      id: paymentId,
      sessionsRemaining: 3,
      totalSessionsBilled: 8,
    });
    (matchingService.createMatchRequestForFormat as any).mockResolvedValue({
      id: 'new-mr',
      status: 'SEARCHING',
    });
    (refundService.createPendingRefund as any).mockResolvedValue({
      id: 'refund-1',
      status: 'PENDING',
    });

    const result = await requestSwitch(studentId, 'STUDENT', undefined, 'ONE_TO_THREE');

    expect(result.oldMembershipStatus).toBe('ENDED');
    expect(result.newMatchRequestId).toBe('new-mr');
    expect(result.refundId).toBe('refund-1');
  });

  it('no active assignment to switch from throws 409', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(null);

    await expect(
      requestSwitch(studentId, 'STUDENT', undefined, 'ONE_TO_THREE'),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'No active assignment to switch from',
    });
  });

  it('already in the requested format throws 400', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(activeMembership());

    await expect(
      requestSwitch(studentId, 'STUDENT', undefined, 'ONE_TO_ONE'),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'You are already in this format',
    });
  });

  it('old assignment cancelled synchronously within this function, not deferred', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(activeMembership());
    (prisma.payment.findFirst as any).mockResolvedValue({
      id: paymentId,
      sessionsRemaining: 0,
      totalSessionsBilled: 8,
    });
    (matchingService.createMatchRequestForFormat as any).mockResolvedValue({
      id: 'new-mr',
      status: 'SEARCHING',
    });

    await requestSwitch(studentId, 'STUDENT', undefined, 'ONE_TO_THREE');

    expect(prisma.cohortMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ENDED' }) }),
    );
  });

  it('re-enters matching via the correct path for a 1-to-1 destination format', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(
      activeMembership({ cohort: { id: cohortId, format: 'ONE_TO_THREE' } }),
    );
    (prisma.payment.findFirst as any).mockResolvedValue({
      id: paymentId,
      sessionsRemaining: 0,
      totalSessionsBilled: 8,
    });
    (matchingService.createMatchRequestForFormat as any).mockResolvedValue({
      id: 'new-mr',
      status: 'SEARCHING',
    });

    await requestSwitch(studentId, 'STUDENT', undefined, 'ONE_TO_ONE');

    expect(matchingService.createMatchRequestForFormat).toHaveBeenCalledWith(
      expect.objectContaining({ toFormat: 'ONE_TO_ONE' }),
    );
  });

  it('re-enters matching via Path C for a group destination format', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(activeMembership());
    (prisma.payment.findFirst as any).mockResolvedValue({
      id: paymentId,
      sessionsRemaining: 0,
      totalSessionsBilled: 8,
    });
    (matchingService.createMatchRequestForFormat as any).mockResolvedValue({
      id: 'new-mr',
      status: 'SEARCHING',
    });

    await requestSwitch(studentId, 'STUDENT', undefined, 'ONE_TO_FIVE');

    expect(matchingService.createMatchRequestForFormat).toHaveBeenCalledWith(
      expect.objectContaining({ toFormat: 'ONE_TO_FIVE' }),
    );
  });

  it('refund is null when there were zero remaining paid sessions', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(activeMembership());
    (prisma.payment.findFirst as any).mockResolvedValue({
      id: paymentId,
      sessionsRemaining: 0,
      totalSessionsBilled: 8,
    });
    (matchingService.createMatchRequestForFormat as any).mockResolvedValue({
      id: 'new-mr',
      status: 'SEARCHING',
    });

    const result = await requestSwitch(studentId, 'STUDENT', undefined, 'ONE_TO_THREE');

    expect(result.refundId).toBeNull();
    expect(refundService.createPendingRefund).not.toHaveBeenCalled();
  });

  it('cohort-mates unaffected — group format switch only ends the caller\u2019s own membership', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(
      activeMembership({ cohort: { id: cohortId, format: 'ONE_TO_FIVE' } }),
    );
    (prisma.payment.findFirst as any).mockResolvedValue({
      id: paymentId,
      sessionsRemaining: 0,
      totalSessionsBilled: 8,
    });
    (matchingService.createMatchRequestForFormat as any).mockResolvedValue({
      id: 'new-mr',
      status: 'SEARCHING',
    });

    await requestSwitch(studentId, 'STUDENT', undefined, 'ONE_TO_ONE');

    expect(prisma.cohortMembership.update).toHaveBeenCalledTimes(1);
    const updateArgs = (prisma.cohortMembership.update as any).mock.calls[0][0];
    expect(updateArgs.where).toMatchObject({ id: membershipId });
  });

  it('outgoing tutor notified with non-punitive, student-initiated framing', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(activeMembership());
    (prisma.payment.findFirst as any).mockResolvedValue({
      id: paymentId,
      sessionsRemaining: 0,
      totalSessionsBilled: 8,
    });
    (matchingService.createMatchRequestForFormat as any).mockResolvedValue({
      id: 'new-mr',
      status: 'SEARCHING',
    });

    await requestSwitch(studentId, 'STUDENT', undefined, 'ONE_TO_THREE');

    const notifyPayload = JSON.stringify((dispatchNotification as any).mock.calls[0]?.[0] ?? {});
    expect(notifyPayload.toLowerCase()).not.toMatch(/complaint|rating|performance|removed for/);
  });

  it('refund amount uses the sessions-delivered proration formula, handed off via refund.service, left PENDING', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(activeMembership());
    (prisma.payment.findFirst as any).mockResolvedValue({
      id: paymentId,
      sessionsRemaining: 4,
      totalSessionsBilled: 8,
    });
    (matchingService.createMatchRequestForFormat as any).mockResolvedValue({
      id: 'new-mr',
      status: 'SEARCHING',
    });
    (refundService.createPendingRefund as any).mockResolvedValue({
      id: 'refund-1',
      status: 'PENDING',
    });

    await requestSwitch(studentId, 'STUDENT', undefined, 'ONE_TO_THREE');

    expect(refundService.createPendingRefund).toHaveBeenCalledWith(paymentId, 'FORMAT_SWITCH');
  });
});
