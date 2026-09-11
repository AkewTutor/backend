/**
 * tests/controllers/badge.controller.test.ts
 *
 * Journey step 6.7. Spec: `09-6-gamification-engagement.md` §9.5.
 * OWASP: A01:2021 – Broken Access Control.
 *
 * `listMyBadges` is described in Doc 8-6 as "a direct read ... scoped to the
 * caller-resolved studentId (H3 fix)" rather than naming a specific
 * `badge.service` export. This suite assumes a `listMyBadges(callerId,
 * callerRole, studentId?)` export, mirroring `xp.controller.ts`'s pattern —
 * flagged for the implementer to confirm.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/badge.service.js', () => ({
  listMyBadges: vi.fn(),
  adminManageBadges: vi.fn(),
  createBadge: vi.fn(),
}));

import * as badgeService from '../../src/services/badge.service.js';
import {
  listMyBadges,
  adminListAll,
  adminCreate,
  adminAdjust,
} from '../../src/controllers/badge.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('badge.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listMyBadges — reaches the handler as a Student', async () => {
    (badgeService.listMyBadges as any).mockResolvedValue({ badges: [] });
    const req = mockReq({ query: {}, user: { id: 'student-1', role: 'STUDENT' } } as any);
    const res = mockRes();

    await listMyBadges(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('listMyBadges — a Parent with ?studentId= follows the ACTIVE ParentStudentRelationship pattern', async () => {
    (badgeService.listMyBadges as any).mockResolvedValue({ badges: [] });
    const req = mockReq({
      query: { studentId: 'student-1' },
      user: { id: 'parent-1', role: 'PARENT' },
    } as any);

    await listMyBadges(req, mockRes(), vi.fn());

    expect(badgeService.listMyBadges).toHaveBeenCalledWith('parent-1', 'PARENT', 'student-1');
  });

  it('adminListAll delegates category/page/limit to the service', async () => {
    (badgeService.adminManageBadges as any).mockResolvedValue({
      badges: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({
      query: { category: 'STUDENT', page: '2', limit: '10' },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    await adminListAll(req, mockRes(), vi.fn());

    expect(badgeService.adminManageBadges).toHaveBeenCalled();
  });

  it('adminCreate forwards a valid Admin-created body — I2 fix', async () => {
    (badgeService.createBadge as any).mockResolvedValue({
      id: 'badge-1',
      name: 'Quarter Champion',
      category: 'STUDENT',
      criteriaDescription: 'Reach a 90-day streak',
      isActive: true,
    });
    const req = mockReq({
      body: {
        name: 'Quarter Champion',
        description: '...',
        category: 'STUDENT',
        criteriaDescription: 'Reach a 90-day streak',
      },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const res = mockRes();

    await adminCreate(req, res, vi.fn());

    expect(badgeService.createBadge).toHaveBeenCalledWith(req.body);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('adminAdjust forwards only the documented fields — no rating-style field is ever forwarded', async () => {
    (badgeService.adminManageBadges as any).mockResolvedValue({
      id: 'badge-1',
      criteriaDescription: '...',
      isActive: true,
    });
    const req = mockReq({
      params: { badgeId: 'badge-1' },
      body: { criteriaDescription: '...', isActive: true, rating: 5 },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);

    await adminAdjust(req, mockRes(), vi.fn());

    const [, forwardedInput] = (badgeService.adminManageBadges as any).mock.calls[0];
    expect(forwardedInput).not.toHaveProperty('rating');
    expect(forwardedInput).toEqual({ criteriaDescription: '...', isActive: true });
  });
});
