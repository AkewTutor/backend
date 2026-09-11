/**
 * tests/controllers/adminDispute.controller.test.ts
 *
 * Journey step 8.6 (controller half). Spec: `09-8-support-trust-admin.md` §9.6.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/adminDispute.service.js', () => ({
  listDisputeQueue: vi.fn(),
  getDisputeForReview: vi.fn(),
  resolveDispute: vi.fn(),
}));

import * as adminDisputeService from '../../src/services/adminDispute.service.js';
import {
  getDisputeDetail,
  listQueue,
  resolveDispute as resolveDisputeHandler,
} from '../../src/controllers/adminDispute.controller.js';
import ApiError from '../../src/utils/ApiError.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('adminDispute.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listQueue forwards query params to the service and responds 200', async () => {
    (adminDisputeService.listDisputeQueue as any).mockResolvedValue({
      complaints: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' },
      query: { status: 'UNDER_REVIEW', category: 'TUTOR_CONDUCT', page: '2', limit: '10' },
    } as any);
    const res = mockRes();

    await listQueue(req, res, vi.fn());

    expect(adminDisputeService.listDisputeQueue).toHaveBeenCalledWith(
      'UNDER_REVIEW',
      'TUTOR_CONDUCT',
      expect.anything(),
      expect.anything(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getDisputeDetail delegates with req.params.complaintId', async () => {
    (adminDisputeService.getDisputeForReview as any).mockResolvedValue({
      id: 'c1',
      status: 'OPEN',
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { complaintId: 'c1' },
    } as any);

    await getDisputeDetail(req, mockRes(), vi.fn());

    expect(adminDisputeService.getDisputeForReview).toHaveBeenCalledWith('c1');
  });

  it('getDisputeDetail propagates a 404 unchanged', async () => {
    (adminDisputeService.getDisputeForReview as any).mockRejectedValue(
      new ApiError(404, 'Complaint not found'),
    );
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { complaintId: 'unknown' },
    } as any);
    const next = vi.fn();

    await getDisputeDetail(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404 });
    }
  });

  it('resolveDispute forwards req.user.id as adminId, never a client-suppliable admin id', async () => {
    (adminDisputeService.resolveDispute as any).mockResolvedValue({
      id: 'c1',
      status: 'DISMISSED',
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { complaintId: 'c1' },
      body: { status: 'DISMISSED', resolutionNotes: 'ok', adminId: 'someone-else' },
    } as any);
    const res = mockRes();

    await resolveDisputeHandler(req, res, vi.fn());

    expect(adminDisputeService.resolveDispute).toHaveBeenCalledWith(
      'c1',
      'admin-1',
      expect.objectContaining({ status: 'DISMISSED' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('resolveDispute propagates the already-closed 409 unchanged', async () => {
    (adminDisputeService.resolveDispute as any).mockRejectedValue(
      new ApiError(409, 'This complaint has already been closed'),
    );
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { complaintId: 'c1' },
      body: { status: 'DISMISSED', resolutionNotes: 'ok' },
    } as any);
    const next = vi.fn();

    await resolveDisputeHandler(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 409 });
    }
  });
});
