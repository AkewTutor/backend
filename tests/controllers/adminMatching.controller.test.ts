/**
 * tests/controllers/adminMatching.controller.test.ts
 *
 * Journey step 3.9. Spec: `09-3-matching-cohorts.md` §9.8.
 * OWASP: A01:2021 – Broken Access Control.
 *
 * Unit tier — mocked service layer.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../../src/services/adminMatching.service.js', () => ({
  listPendingApprovals: vi.fn(),
  approveBooking: vi.fn(),
  rejectBooking: vi.fn(),
  manuallyAssignTutor: vi.fn(),
  manuallyAssembleGroup: vi.fn(),
}));

import * as adminMatchingService from '../../src/services/adminMatching.service.js';
import {
  approve,
  listQueue,
  manualAssign,
  reject,
} from '../../src/controllers/adminMatching.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 'admin-1', role: 'ADMIN' },
    ...overrides,
  } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

const cohortId = randomUUID();
const tutorId = randomUUID();

describe.skip('adminMatching.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listQueue delegates and responds 200', async () => {
    (adminMatchingService.listPendingApprovals as any).mockResolvedValue({
      queue: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({ query: { overdueOnly: 'false' } as any });
    const res = mockRes();

    await listQueue(req, res, vi.fn() as NextFunction);

    expect(adminMatchingService.listPendingApprovals).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('approve passes req.user.id as adminId — never client-suppliable', async () => {
    (adminMatchingService.approveBooking as any).mockResolvedValue({
      cohortId,
      status: 'PENDING_PAYMENT',
    });
    const req = mockReq({
      params: { cohortId },
      body: { adminId: 'spoofed-admin-id' },
      user: { id: 'real-admin', role: 'ADMIN' } as any,
    });
    const res = mockRes();

    await approve(req, res, vi.fn() as NextFunction);

    expect(adminMatchingService.approveBooking).toHaveBeenCalledWith(cohortId, 'real-admin');
  });

  it('reject passes req.user.id as adminId — never client-suppliable', async () => {
    (adminMatchingService.rejectBooking as any).mockResolvedValue({
      cohortId,
      status: 'CANCELLED',
    });
    const req = mockReq({
      params: { cohortId },
      body: { internalReason: 'reason', adminId: 'spoofed-admin-id' },
      user: { id: 'real-admin', role: 'ADMIN' } as any,
    });
    const res = mockRes();

    await reject(req, res, vi.fn() as NextFunction);

    expect(adminMatchingService.rejectBooking).toHaveBeenCalledWith(
      cohortId,
      'real-admin',
      'reason',
    );
  });

  it('manualAssign dispatches to manuallyAssembleGroup for multi-id requests', async () => {
    (adminMatchingService.manuallyAssembleGroup as any).mockResolvedValue({
      cohortId,
      status: 'PENDING_PAYMENT',
    });
    const req = mockReq({
      body: { matchRequestIds: [randomUUID(), randomUUID()], tutorId },
    });
    const res = mockRes();

    await manualAssign(req, res, vi.fn() as NextFunction);

    expect(adminMatchingService.manuallyAssembleGroup).toHaveBeenCalled();
    expect(adminMatchingService.manuallyAssignTutor).not.toHaveBeenCalled();
  });

  it('manualAssign dispatches to manuallyAssignTutor for a single-id request', async () => {
    (adminMatchingService.manuallyAssignTutor as any).mockResolvedValue({
      cohortId,
      status: 'PENDING_PAYMENT',
    });
    const req = mockReq({
      body: { matchRequestIds: [randomUUID()], tutorId },
    });
    const res = mockRes();

    await manualAssign(req, res, vi.fn() as NextFunction);

    expect(adminMatchingService.manuallyAssignTutor).toHaveBeenCalled();
    expect(adminMatchingService.manuallyAssembleGroup).not.toHaveBeenCalled();
  });
});
