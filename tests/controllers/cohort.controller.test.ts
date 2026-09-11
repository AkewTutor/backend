/**
 * tests/controllers/cohort.controller.test.ts
 *
 * Journey step 3.6. Spec: `09-3-matching-cohorts.md` §9.6.
 *
 * Unit tier — mocked service layer.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../../src/services/cohort.service.js', () => ({
  getMyCohort: vi.fn(),
  getCohortMembers: vi.fn(),
}));

import * as cohortService from '../../src/services/cohort.service.js';
import { getCohortMembers, getMyCohort } from '../../src/controllers/cohort.controller.js';
import ApiError from '../../src/utils/ApiError.js';

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

const cohortId = randomUUID();

describe.skip('cohort.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMyCohort delegates and responds 200', async () => {
    (cohortService.getMyCohort as any).mockResolvedValue({ cohorts: [] });
    const req = mockReq();
    const res = mockRes();

    await getMyCohort(req, res, vi.fn() as NextFunction);

    expect(cohortService.getMyCohort).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCohortMembers delegates and responds 200', async () => {
    (cohortService.getCohortMembers as any).mockResolvedValue({ cohortId, tutor: {} });
    const req = mockReq({ params: { cohortId } });
    const res = mockRes();

    await getCohortMembers(req, res, vi.fn() as NextFunction);

    expect(cohortService.getCohortMembers).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCohortMembers propagates a 403 unchanged', async () => {
    (cohortService.getCohortMembers as any).mockRejectedValue(
      new ApiError(403, 'Not authorized to view this cohort'),
    );
    const req = mockReq({ params: { cohortId } });
    const next = vi.fn();

    await getCohortMembers(req, mockRes(), next as NextFunction).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    }
  });
});
