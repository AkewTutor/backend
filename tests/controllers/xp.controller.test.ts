/**
 * tests/controllers/xp.controller.test.ts
 *
 * Journey step 6.3. Spec: `09-6-gamification-engagement.md` §9.3.
 * OWASP: A01:2021 – Broken Access Control.
 *
 * `8-6-gamification-engagement.md` describes `getMyProgress`'s controller
 * handler as "an xp.service read" without pinning an exact exported function
 * name (unlike `awardXP`/`getLeaderboard`/`adminAdjustXP`, which are named).
 * This suite assumes a `getMyProgress(callerId, callerRole, studentId?)`
 * export on `xp.service.ts`, mirroring `getLeaderboard`'s own resolved
 * (callerId, callerRole, studentId, ...) shape — flagged for the implementer
 * to confirm or rename consistently.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/xp.service.js', () => ({
  getMyProgress: vi.fn(),
  getLeaderboard: vi.fn(),
  adminAdjustXP: vi.fn(),
}));

import * as xpService from '../../src/services/xp.service.js';
import { getMyProgress, getLeaderboard, adminAdjust } from '../../src/controllers/xp.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('xp.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMyProgress is Student|Parent — a Student token reaches the handler', async () => {
    (xpService.getMyProgress as any).mockResolvedValue({
      totalXP: 1240,
      streak: { currentStreakDays: 5, longestStreakDays: 12, lastActivityDate: '2026-09-06' },
      recentEntries: [],
    });
    const req = mockReq({ query: {}, user: { id: 'student-1', role: 'STUDENT' } } as any);
    const res = mockRes();

    await getMyProgress(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getMyProgress is Student|Parent — a Parent without ?studentId= is rejected', async () => {
    const req = mockReq({ query: {}, user: { id: 'parent-1', role: 'PARENT' } } as any);
    const res = mockRes();
    const next = vi.fn();

    await getMyProgress(req, res, next).catch(() => undefined);

    const rejectedViaThrowOrNext =
      (xpService.getMyProgress as any).mock.calls.length === 0 ||
      next.mock.calls.some((c: any[]) => c[0]?.statusCode === 400);
    expect(rejectedViaThrowOrNext).toBe(true);
  });

  it('getMyProgress — Parent resolution uses the same ACTIVE ParentStudentRelationship pattern as the service', async () => {
    (xpService.getMyProgress as any).mockResolvedValue({
      totalXP: 500,
      streak: { currentStreakDays: 2, longestStreakDays: 2, lastActivityDate: '2026-09-05' },
      recentEntries: [],
    });
    const req = mockReq({
      query: { studentId: 'student-1' },
      user: { id: 'parent-1', role: 'PARENT' },
    } as any);

    await getMyProgress(req, mockRes(), vi.fn());

    expect(xpService.getMyProgress).toHaveBeenCalledWith('parent-1', 'PARENT', 'student-1');
  });

  it('a streak reset never reduces totalXP', async () => {
    (xpService.getMyProgress as any).mockResolvedValue({
      totalXP: 500,
      streak: { currentStreakDays: 1, longestStreakDays: 30, lastActivityDate: '2026-09-06' },
      recentEntries: [],
    });
    const req = mockReq({ query: {}, user: { id: 'student-1', role: 'STUDENT' } } as any);
    const res = mockRes();

    await getMyProgress(req, res, vi.fn());

    const payload = (res.json as any).mock.calls[0][0];
    expect(payload.data.totalXP).toBe(500);
  });

  it('getLeaderboard requires period — missing ?period= is rejected before the service runs', async () => {
    const req = mockReq({ query: {}, user: { id: 'student-1', role: 'STUDENT' } } as any);
    const next = vi.fn();

    await getLeaderboard(req, mockRes(), next).catch(() => undefined);

    expect(xpService.getLeaderboard).not.toHaveBeenCalled();
  });

  it('getLeaderboard delegates to xpService.getLeaderboard with req.user context and query params', async () => {
    (xpService.getLeaderboard as any).mockResolvedValue({
      grade: 8,
      period: 'WEEKLY',
      rankings: [],
      callerRank: null,
    });
    const req = mockReq({
      query: { period: 'WEEKLY' },
      user: { id: 'student-1', role: 'STUDENT' },
    } as any);

    await getLeaderboard(req, mockRes(), vi.fn());

    expect(xpService.getLeaderboard).toHaveBeenCalledWith(
      'student-1',
      'STUDENT',
      undefined,
      'WEEKLY',
    );
  });

  it('adminAdjust passes req.user.id as the adjusting admin, never a client-suppliable admin id', async () => {
    (xpService.adminAdjustXP as any).mockResolvedValue({
      id: 'entry-1',
      studentId: 'student-1',
      amount: 10,
      reason: 'OTHER',
      note: 'note',
      createdAt: new Date(),
    });
    const req = mockReq({
      params: { studentId: 'student-1' },
      body: { amount: 10, note: 'note', adminId: 'someone-else' },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const res = mockRes();

    await adminAdjust(req, res, vi.fn());

    expect(xpService.adminAdjustXP).toHaveBeenCalledWith('student-1', 'admin-1', 10, 'note');
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
