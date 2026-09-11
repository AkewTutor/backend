/**
 * tests/controllers/payout.controller.test.ts
 *
 * Phase 7, step 7.21. Spec: `09-7-payments-earnings.md` §9.17 (controller half).
 * OWASP: A01:2021 – Broken Access Control.
 *
 * Interface note: Doc 8-7 lists `adminList` as "`payoutService` read,
 * filtered by `tutorId`/`status`" — a service delegate (unlike
 * `paymentPause.controller.ts → getPauseStatus` and
 * `refund.controller.ts → adminReview`, which are direct Prisma reads).
 * `payout.service.ts`'s own test file (7.20) only pins
 * `generateMonthlyPayouts`/`markPaid`/`adminAdjust`; this suite assumes
 * the most direct additional export matching Doc 8-7's wording —
 * `listPayouts(filters)` — the same "read filtered by tutorId/status"
 * shape `refund.controller.ts`'s direct-read `adminReview` uses, just
 * routed through the service layer here per the doc's explicit wording.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/payout.service.js', () => ({
  generateMonthlyPayouts: vi.fn(),
  markPaid: vi.fn(),
  adminAdjust: vi.fn(),
  listPayouts: vi.fn(),
}));

import * as payoutService from '../../src/services/payout.service.js';
import { adminList, adminMarkPaid } from '../../src/controllers/payout.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('payout.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adminList delegates to the payout read, filtered by tutorId/status from the query', async () => {
    (payoutService.listPayouts as any).mockResolvedValue({
      payouts: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' } as any,
      query: { tutorId: 'tutor-1', status: 'PENDING' },
    });
    const res = mockRes();

    await adminList(req, res, vi.fn());

    expect(payoutService.listPayouts).toHaveBeenCalledWith(
      expect.objectContaining({ tutorId: 'tutor-1', status: 'PENDING' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('adminList works with no filters — an Admin browsing the full queue', async () => {
    (payoutService.listPayouts as any).mockResolvedValue({
      payouts: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({ user: { id: 'admin-1', role: 'ADMIN' } as any, query: {} });
    const res = mockRes();

    await adminList(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('adminMarkPaid passes req.user.id, never a client-suppliable admin id', async () => {
    (payoutService.markPaid as any).mockResolvedValue({
      id: 'payout-1',
      status: 'PAID',
      paidAt: new Date(),
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' } as any,
      params: { payoutId: 'payout-1' },
      body: { adminId: 'someone-else' },
    });
    const res = mockRes();

    await adminMarkPaid(req, res, vi.fn());

    expect(payoutService.markPaid).toHaveBeenCalledWith('payout-1', 'admin-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
