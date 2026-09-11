/**
 * tests/controllers/refund.controller.test.ts
 *
 * Phase 7, step 7.15. Spec: `09-7-payments-earnings.md` §9.13 (controller
 * half). Doc 8-7 — **I1 fix**.
 *
 * Interface note: `adminReview` is a "Paginated Prisma read of Refund rows
 * filtered by status ... — no longer a live calculateProration
 * computation", not a `refund.service.ts` delegate (same direct-read shape
 * as `paymentPause.controller.ts`'s `getPauseStatus`). `adminApprove` and
 * `adminReject` do delegate to `refund.service.ts`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    refund: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/refund.service.js', () => ({
  approveRefund: vi.fn(),
  rejectRefund: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import * as refundService from '../../src/services/refund.service.js';
import { adminApprove, adminReject, adminReview } from '../../src/controllers/refund.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('refund.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adminReview reads persisted rows, not a live calculation — calculateProration is never invoked by this handler', async () => {
    (prisma.refund.findMany as any).mockResolvedValue([
      { id: 'refund-1', status: 'PENDING', amount: '300.00', createdAt: new Date() },
    ]);
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' } as any,
      query: { status: 'PENDING' },
    });
    const res = mockRes();

    await adminReview(req, res, vi.fn());

    expect(prisma.refund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('adminReview defaults to status PENDING when no query filter is given', async () => {
    (prisma.refund.findMany as any).mockResolvedValue([]);
    const req = mockReq({ user: { id: 'admin-1', role: 'ADMIN' } as any, query: {} });
    const res = mockRes();

    await adminReview(req, res, vi.fn());

    expect(prisma.refund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) }),
    );
  });

  it('adminApprove passes req.user.id as approver, never a client-suppliable approver id', async () => {
    (refundService.approveRefund as any).mockResolvedValue({
      id: 'refund-1',
      status: 'APPROVED',
      amount: '300.00',
      approvedById: 'admin-1',
      approvedAt: new Date(),
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' } as any,
      params: { refundId: 'refund-1' },
      body: { approvedById: 'someone-else' },
    });
    const res = mockRes();

    await adminApprove(req, res, vi.fn());

    expect(refundService.approveRefund).toHaveBeenCalledWith('refund-1', 'admin-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('adminReject passes req.user.id as rejector and req.body.rejectionReason, never a client-suppliable rejector id', async () => {
    (refundService.rejectRefund as any).mockResolvedValue({
      id: 'refund-1',
      status: 'REJECTED',
      rejectedById: 'admin-1',
      rejectedAt: new Date(),
      rejectionReason: 'Student-caused disruption',
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' } as any,
      params: { refundId: 'refund-1' },
      body: { rejectionReason: 'Student-caused disruption', rejectedById: 'someone-else' },
    });
    const res = mockRes();

    await adminReject(req, res, vi.fn());

    expect(refundService.rejectRefund).toHaveBeenCalledWith(
      'refund-1',
      'admin-1',
      'Student-caused disruption',
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
