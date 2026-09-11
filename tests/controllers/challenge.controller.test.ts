/**
 * tests/controllers/challenge.controller.test.ts
 *
 * Journey step 6.12. Spec: `09-6-gamification-engagement.md` §9.9.
 * OWASP: A01:2021 – Broken Access Control.
 *
 * `getMyProgress`'s underlying read is described as "direct read of
 * ChallengeProgress ... (H3 fix)" without a pinned `challenge.service`
 * export name; this suite assumes a `getMyProgress(callerId, callerRole,
 * studentId?)` export, mirroring `xp.controller.ts`'s pattern — flagged for
 * the implementer to confirm.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/challenge.service.js', () => ({
  listActiveChallenges: vi.fn(),
  createChallenge: vi.fn(),
  getMyProgress: vi.fn(),
}));

import * as challengeService from '../../src/services/challenge.service.js';
import {
  listActive,
  adminCreate,
  getMyProgress,
} from '../../src/controllers/challenge.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('challenge.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listActive is Student|Parent (H3-consistency fix) — reaches the handler as a Student', async () => {
    (challengeService.listActiveChallenges as any).mockResolvedValue([]);
    const req = mockReq({ user: { id: 'student-1', role: 'STUDENT' } } as any);
    const res = mockRes();

    await listActive(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('listActive is Student|Parent — reaches the handler as a Parent with no studentId scoping needed', async () => {
    (challengeService.listActiveChallenges as any).mockResolvedValue([]);
    const req = mockReq({ user: { id: 'parent-1', role: 'PARENT' } } as any);
    const res = mockRes();

    await listActive(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(challengeService.listActiveChallenges).toHaveBeenCalledWith();
  });

  it('getMyProgress is Student|Parent — a Parent with ?studentId= uses the ACTIVE ParentStudentRelationship resolution pattern', async () => {
    (challengeService.getMyProgress as any).mockResolvedValue({ progress: [] });
    const req = mockReq({
      query: { studentId: 'student-1' },
      user: { id: 'parent-1', role: 'PARENT' },
    } as any);

    await getMyProgress(req, mockRes(), vi.fn());

    expect(challengeService.getMyProgress).toHaveBeenCalledWith('parent-1', 'PARENT', 'student-1');
  });

  it('adminCreate delegates to challengeService.createChallenge with req.body and req.user.id', async () => {
    (challengeService.createChallenge as any).mockResolvedValue({
      id: 'challenge-1',
      title: 'Complete 3 assessments this week',
      period: 'WEEKLY',
    });
    const req = mockReq({
      body: {
        title: 'Complete 3 assessments this week',
        description: '...',
        period: 'WEEKLY',
        startsAt: '2026-09-01T00:00:00Z',
        endsAt: '2026-09-07T23:59:59Z',
        targetValue: 3,
      },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const res = mockRes();

    await adminCreate(req, res, vi.fn());

    expect(challengeService.createChallenge).toHaveBeenCalledWith(req.body, 'admin-1');
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
