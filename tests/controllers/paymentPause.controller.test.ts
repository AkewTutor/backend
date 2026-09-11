/**
 * tests/controllers/paymentPause.controller.test.ts
 *
 * Phase 7, step 7.7. Spec: `09-7-payments-earnings.md` §9.7 (controller half).
 *
 * Interface note: `8-7-payments-earnings.md`'s controller table lists
 * `getPauseStatus` as a "direct read of PaymentPause + affected sessions
 * for cohortMembershipId" — unlike every other handler in this feature, it
 * is not routed through a dedicated `paymentPause.service.ts` export
 * (that file's own exports are the three event-driven functions already
 * covered in `paymentPause.service.test.ts`, none of which are
 * client-facing). This suite therefore mocks Prisma directly, the same
 * seam a "direct read" handler actually depends on.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    paymentPause: {
      findFirst: vi.fn(),
    },
    scheduledSession: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import { getPauseStatus } from '../../src/controllers/paymentPause.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('paymentPause.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires the caller's cohortMembershipId and resolves { isPaused: false } when no active pause exists", async () => {
    (prisma.paymentPause.findFirst as any).mockResolvedValue(null);
    const req = mockReq({
      user: { id: 'student-1', role: 'STUDENT' } as any,
      query: { cohortMembershipId: 'membership-1' },
    });
    const res = mockRes();

    await getPauseStatus(req, res, vi.fn());

    expect(prisma.paymentPause.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cohortMembershipId: 'membership-1' }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPaused: false }) }),
    );
  });

  it("resolves an active-pause shape including affectedSessions, scoped to the caller's membership", async () => {
    (prisma.paymentPause.findFirst as any).mockResolvedValue({
      id: 'pause-1',
      cohortMembershipId: 'membership-1',
      startedAt: new Date('2026-09-04T00:00:00Z'),
      endedAt: null,
      reason: 'NONPAYMENT',
    });
    (prisma.scheduledSession.findMany as any).mockResolvedValue([
      {
        id: 'session-1',
        scheduledStart: new Date('2026-09-05T16:00:00Z'),
        status: 'PAYMENT_PAUSE_RESCHEDULED',
      },
    ]);
    const req = mockReq({
      user: { id: 'student-1', role: 'STUDENT' } as any,
      query: { cohortMembershipId: 'membership-1' },
    });
    const res = mockRes();

    await getPauseStatus(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isPaused: true,
          reason: 'NONPAYMENT',
          affectedSessions: expect.arrayContaining([
            expect.objectContaining({
              sessionId: 'session-1',
              status: 'PAYMENT_PAUSE_RESCHEDULED',
            }),
          ]),
        }),
      }),
    );
  });
});
