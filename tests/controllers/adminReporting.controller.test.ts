/**
 * tests/controllers/adminReporting.controller.test.ts
 *
 * Journey step 8.9 (controller half). Spec: `09-8-support-trust-admin.md` §9.8.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/adminReporting.service.js', () => ({
  aggregatePlatformHealth: vi.fn(),
  getActivityHistory: vi.fn(),
  getTutorPerformanceHistory: vi.fn(),
}));

import * as adminReportingService from '../../src/services/adminReporting.service.js';
import {
  getActivity,
  getStats,
  getTutorPerformance,
} from '../../src/controllers/adminReporting.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('adminReporting.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getStats delegates with no args and responds 200', async () => {
    (adminReportingService.aggregatePlatformHealth as any).mockResolvedValue({
      openDisputes: 0,
      overdueMatchApprovals: 0,
      recordingComplianceEscalations: 0,
      pendingPayoutBatches: 0,
      generatedAt: new Date(),
    });
    const req = mockReq({ user: { id: 'admin-1', role: 'ADMIN' } } as any);
    const res = mockRes();

    await getStats(req, res, vi.fn());

    expect(adminReportingService.aggregatePlatformHealth).toHaveBeenCalledWith();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getActivity delegates req.query unchanged, no silent transformation', async () => {
    // 8-8-support-trust-admin.md's controller table documents this handler's
    // call as `getActivityHistory(req.query.page, req.query.limit,
    // req.query.dateRange)` — three positional args. `eventType` is a
    // documented query filter in 06-api/08 §8.2 but is not wired into this
    // function-level spec's call shape or the service signature; that gap
    // is pre-existing in Doc 08, not introduced or silently patched here.
    (adminReportingService.getActivityHistory as any).mockResolvedValue({
      events: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' },
      query: { page: '2', limit: '10', dateRange: '7d' },
    } as any);

    await getActivity(req, mockRes(), vi.fn());

    expect(adminReportingService.getActivityHistory).toHaveBeenCalledWith('2', '10', '7d');
  });

  it('getTutorPerformance delegates req.query unchanged', async () => {
    (adminReportingService.getTutorPerformanceHistory as any).mockResolvedValue({
      tutors: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' },
      query: { tutorId: 'tutor-1', page: '1', limit: '20' },
    } as any);

    await getTutorPerformance(req, mockRes(), vi.fn());

    expect(adminReportingService.getTutorPerformanceHistory).toHaveBeenCalledWith(
      'tutor-1',
      '1',
      '20',
    );
  });
});
