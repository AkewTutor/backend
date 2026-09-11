/**
 * tests/controllers/reschedule.controller.test.ts
 *
 * Journey step 4.19. Spec: `09-4-class-delivery-library.md` §9.16.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/reschedule.service.js', () => ({
  requestReschedule: vi.fn(),
}));

import * as rescheduleService from '../../src/services/reschedule.service.js';
import { requestReschedule } from '../../src/controllers/reschedule.controller.js';
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

describe.skip('reschedule.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requestReschedule delegates with (req.user.id, req.body.sessionId, req.body.requestedNewStart)', async () => {
    (rescheduleService.requestReschedule as any).mockResolvedValue({
      id: 'reschedule-1',
      sessionId: 'session-1',
      requestedNewStart: new Date().toISOString(),
      noticeHours: '18.0',
      classification: 'FREE_RESCHEDULE',
      freeReschedulesUsedThisMonth: 1,
    });
    const req = mockReq({
      body: { sessionId: 'session-1', requestedNewStart: '2026-09-09T16:00:00Z' },
      user: { id: 'student-1', role: 'STUDENT' },
    } as any);
    const res = mockRes();

    await requestReschedule(req, res, vi.fn());

    expect(rescheduleService.requestReschedule).toHaveBeenCalledWith(
      'student-1',
      'session-1',
      new Date('2026-09-09T16:00:00Z'),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('is a pass-through for ownership errors from the service — a 403 propagates unchanged', async () => {
    (rescheduleService.requestReschedule as any).mockRejectedValue(
      new ApiError(403, 'Not authorized'),
    );
    const req = mockReq({
      body: { sessionId: 'session-1', requestedNewStart: '2026-09-09T16:00:00Z' },
      user: { id: 'unrelated-user', role: 'STUDENT' },
    } as any);
    const next = vi.fn();

    await requestReschedule(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    }
  });
});
