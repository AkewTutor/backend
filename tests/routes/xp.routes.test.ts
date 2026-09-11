/**
 * tests/routes/xp.routes.test.ts
 *
 * Journey step 6.4. Spec: `09-6-gamification-engagement.md` §9.3.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/xp.service.js', () => ({
  getMyProgress: vi.fn(),
  getLeaderboard: vi.fn(),
  adminAdjustXP: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    if (token === 'parent-token') return { id: 'parent-1', role: 'PARENT' };
    throw new Error('invalid token');
  }),
}));

import * as xpService from '../../src/services/xp.service.js';
import app from '../../src/app.js';

describe.skip('xp.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (xpService.getMyProgress as any).mockResolvedValue({
      totalXP: 100,
      streak: { currentStreakDays: 1, longestStreakDays: 1, lastActivityDate: '2026-09-06' },
      recentEntries: [],
    });
    (xpService.getLeaderboard as any).mockResolvedValue({
      grade: 8,
      period: 'WEEKLY',
      rankings: [],
      callerRank: null,
    });
    (xpService.adminAdjustXP as any).mockResolvedValue({
      id: 'entry-1',
      studentId: 'student-1',
      amount: -20,
      reason: 'OTHER',
      note: 'Reversing an erroneous award',
      createdAt: new Date().toISOString(),
    });
  });

  it('both public-facing routes require auth — 401 with no token', async () => {
    const progressRes = await request(app).get('/api/v1/gamification/xp/me');
    const leaderboardRes = await request(app).get('/api/v1/gamification/leaderboard');

    expect(progressRes.status).toBe(401);
    expect(leaderboardRes.status).toBe(401);
  });

  it('GET /gamification/xp/me — a Student token reaches the handler', async () => {
    const res = await request(app)
      .get('/api/v1/gamification/xp/me')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(200);
  });

  it('GET /gamification/xp/me — a Parent without ?studentId= is rejected', async () => {
    const res = await request(app)
      .get('/api/v1/gamification/xp/me')
      .set('Authorization', 'Bearer parent-token');

    expect(res.status).toBe(400);
    expect(xpService.getMyProgress).not.toHaveBeenCalled();
  });

  it('GET /gamification/xp/me — a Parent with ?studentId= reaches the handler', async () => {
    const res = await request(app)
      .get('/api/v1/gamification/xp/me?studentId=student-1')
      .set('Authorization', 'Bearer parent-token');

    expect(res.status).toBe(200);
  });

  it('GET /gamification/leaderboard requires ?period=', async () => {
    const res = await request(app)
      .get('/api/v1/gamification/leaderboard')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(400);
    expect(xpService.getLeaderboard).not.toHaveBeenCalled();
  });

  it('GET /gamification/leaderboard succeeds with a valid period', async () => {
    const res = await request(app)
      .get('/api/v1/gamification/leaderboard?period=WEEKLY')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(200);
  });

  it('adminAdjust requires Admin — 401 with no token, then 403 with a Parent token', async () => {
    const noToken = await request(app)
      .post('/api/v1/admin/students/student-1/xp-adjustments')
      .send({ amount: 10, note: 'note' });
    const parentToken = await request(app)
      .post('/api/v1/admin/students/student-1/xp-adjustments')
      .set('Authorization', 'Bearer parent-token')
      .send({ amount: 10, note: 'note' });

    expect(noToken.status).toBe(401);
    expect(parentToken.status).toBe(403);
  });

  it('adminAdjust — never calls the service with a client-suppliable admin id', async () => {
    const res = await request(app)
      .post('/api/v1/admin/students/student-1/xp-adjustments')
      .set('Authorization', 'Bearer admin-token')
      .send({ amount: -20, note: 'Reversing an erroneous award', adminId: 'someone-else' });

    expect(res.status).toBe(201);
    expect(xpService.adminAdjustXP).toHaveBeenCalledWith(
      'student-1',
      'admin-1',
      -20,
      'Reversing an erroneous award',
    );
  });

  it('adminAdjust validates body — rejects amount: 0 and a missing note before the controller runs', async () => {
    const zeroAmount = await request(app)
      .post('/api/v1/admin/students/student-1/xp-adjustments')
      .set('Authorization', 'Bearer admin-token')
      .send({ amount: 0, note: 'note' });
    const missingNote = await request(app)
      .post('/api/v1/admin/students/student-1/xp-adjustments')
      .set('Authorization', 'Bearer admin-token')
      .send({ amount: 10 });

    expect(zeroAmount.status).toBe(400);
    expect(missingNote.status).toBe(400);
    expect(xpService.adminAdjustXP).not.toHaveBeenCalled();
  });
});
