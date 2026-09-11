/**
 * tests/controllers/sessionMiss.controller.test.ts
 *
 * Journey step 4.22. Spec: `09-4-class-delivery-library.md` §9.18.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/sessionMiss.service.js', () => ({
  listMisses: vi.fn(),
  recordTutorCausedMiss: vi.fn(),
  recordStudentCausedMiss: vi.fn(),
}));

import * as sessionMissService from '../../src/services/sessionMiss.service.js';
import { listMisses, reportMiss } from '../../src/controllers/sessionMiss.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('sessionMiss.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (sessionMissService.listMisses as any).mockResolvedValue({
      misses: [],
      escalationFlag: false,
      page: 1,
      limit: 20,
      total: 0,
    });
  });

  it('GET / allows a Tutor to see only their own record — scoped to req.user.id, ignoring any client-supplied tutorId', async () => {
    const req = mockReq({
      query: { tutorId: 'some-other-tutor' },
      user: { id: 'tutor-1', role: 'TUTOR' },
    } as any);
    const res = mockRes();

    await listMisses(req, res, vi.fn());

    expect(sessionMissService.listMisses).toHaveBeenCalledWith(
      expect.objectContaining({ tutorId: 'tutor-1' }),
    );
  });

  it('GET / allows Admin to view any tutor via query param', async () => {
    const req = mockReq({
      query: { tutorId: 'some-other-tutor' },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const res = mockRes();

    await listMisses(req, res, vi.fn());

    expect(sessionMissService.listMisses).toHaveBeenCalledWith(
      expect.objectContaining({ tutorId: 'some-other-tutor' }),
    );
  });

  it("reportMiss branches to recordTutorCausedMiss for causedBy: 'TUTOR'", async () => {
    (sessionMissService.recordTutorCausedMiss as any).mockResolvedValue({
      id: 'miss-1',
      sessionId: 'session-1',
      causedBy: 'TUTOR',
      missType: 'NO_SHOW',
      makeupSessionId: 'makeup-1',
      makeupDeadline: new Date().toISOString(),
      tutorEarningRateForMakeup: 'REDUCED_MAKEUP',
    });
    const req = mockReq({
      body: { sessionId: 'session-1', causedBy: 'TUTOR', missType: 'NO_SHOW' },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const res = mockRes();

    await reportMiss(req, res, vi.fn());

    expect(sessionMissService.recordTutorCausedMiss).toHaveBeenCalledWith('session-1', 'NO_SHOW');
    expect(sessionMissService.recordStudentCausedMiss).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("reportMiss branches to recordStudentCausedMiss for causedBy: 'STUDENT'", async () => {
    (sessionMissService.recordStudentCausedMiss as any).mockResolvedValue({
      id: 'miss-1',
      sessionId: 'session-1',
      causedBy: 'STUDENT',
      missType: 'NO_SHOW',
      makeupSessionId: null,
      tutorEarningRateForOriginalSession: 'FULL',
    });
    const req = mockReq({
      body: { sessionId: 'session-1', causedBy: 'STUDENT', missType: 'NO_SHOW' },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const res = mockRes();

    await reportMiss(req, res, vi.fn());

    expect(sessionMissService.recordStudentCausedMiss).toHaveBeenCalledWith('session-1', 'NO_SHOW');
    expect(sessionMissService.recordTutorCausedMiss).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
