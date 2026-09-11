/**
 * tests/controllers/formatSwitch.controller.test.ts
 *
 * Journey step 3.13. Spec: `09-3-matching-cohorts.md` §9.11.
 *
 * Unit tier — mocked service layer.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../../src/services/formatSwitch.service.js', () => ({
  requestSwitch: vi.fn(),
}));

import * as formatSwitchService from '../../src/services/formatSwitch.service.js';
import { requestSwitch as requestSwitchController } from '../../src/controllers/formatSwitch.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 'user-1', role: 'STUDENT' },
    ...overrides,
  } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

const studentId = randomUUID();

describe.skip('formatSwitch.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes req.user through, along with body fields, and responds 201', async () => {
    (formatSwitchService.requestSwitch as any).mockResolvedValue({
      formatSwitchRequestId: 'fsr-1',
      fromFormat: 'ONE_TO_ONE',
      toFormat: 'ONE_TO_THREE',
      oldMembershipStatus: 'ENDED',
      newMatchRequestId: 'mr-1',
      refundId: null,
    });
    const req = mockReq({
      body: { studentId, toFormat: 'ONE_TO_THREE' },
      user: { id: 'parent-1', role: 'PARENT' } as any,
    });
    const res = mockRes();

    await requestSwitchController(req, res, vi.fn() as NextFunction);

    expect(formatSwitchService.requestSwitch).toHaveBeenCalledWith(
      'parent-1',
      'PARENT',
      studentId,
      'ONE_TO_THREE',
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
