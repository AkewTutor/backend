/**
 * tests/controllers/earning.controller.test.ts
 *
 * Phase 7, step 7.18. Spec: `09-7-payments-earnings.md` §9.15 (controller half).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/earning.service.js', () => ({
  creditEarning: vi.fn(),
  getEarningsForTutor: vi.fn(),
}));

import * as earningService from '../../src/services/earning.service.js';
import { getMyEarnings } from '../../src/controllers/earning.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('earning.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMyEarnings is always scoped to the caller — req.user.id, never a client-suppliable tutorId', async () => {
    (earningService.getEarningsForTutor as any).mockResolvedValue({
      earnings: [],
      upcomingPayout: { amount: '0.00' },
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({
      user: { id: 'tutor-1', role: 'TUTOR' } as any,
      query: { page: '1', limit: '20', tutorId: 'someone-else' },
    });
    const res = mockRes();

    await getMyEarnings(req, res, vi.fn());

    expect(earningService.getEarningsForTutor).toHaveBeenCalledWith(
      'tutor-1',
      expect.anything(),
      expect.anything(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
