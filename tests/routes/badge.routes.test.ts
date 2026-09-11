/**
 * tests/routes/badge.routes.test.ts
 *
 * Journey step 6.8. Spec: `09-6-gamification-engagement.md` §9.5.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/badge.service.js', () => ({
  listMyBadges: vi.fn(),
  adminManageBadges: vi.fn(),
  createBadge: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    throw new Error('invalid token');
  }),
}));

import * as badgeService from '../../src/services/badge.service.js';
import app from '../../src/app.js';

describe.skip('badge.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (badgeService.listMyBadges as any).mockResolvedValue({ badges: [] });
    (badgeService.adminManageBadges as any).mockResolvedValue({
      badges: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    (badgeService.createBadge as any).mockResolvedValue({
      id: 'badge-1',
      name: 'Quarter Champion',
      category: 'STUDENT',
      criteriaDescription: 'Reach a 90-day streak',
      isActive: true,
    });
  });

  it('GET /gamification/badges/me succeeds with a Student token', async () => {
    const res = await request(app)
      .get('/api/v1/gamification/badges/me')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(200);
  });

  it('adminListAll / adminCreate / adminAdjust require Admin — 401 with no token, 403 with a Student token', async () => {
    const targets: Array<[string, 'get' | 'post' | 'patch']> = [
      ['/api/v1/admin/badges', 'get'],
      ['/api/v1/admin/badges', 'post'],
      ['/api/v1/admin/badges/badge-1', 'patch'],
    ];

    for (const [path, method] of targets) {
      const noToken = await (request(app) as any)[method](path).send({});
      expect(noToken.status).toBe(401);

      const studentToken = await (request(app) as any)
        [method](path)
        .set('Authorization', 'Bearer student-token')
        .send({});
      expect(studentToken.status).toBe(403);
    }
  });

  it('adminCreate validates body — a missing name is rejected before the controller runs', async () => {
    const res = await request(app)
      .post('/api/v1/admin/badges')
      .set('Authorization', 'Bearer admin-token')
      .send({ description: '...', category: 'STUDENT', criteriaDescription: '...' });

    expect(res.status).toBe(400);
    expect(badgeService.createBadge).not.toHaveBeenCalled();
  });

  it('adminCreate validates body — an invalid category is rejected before the controller runs', async () => {
    const res = await request(app)
      .post('/api/v1/admin/badges')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'x', description: '...', category: 'ADMIN', criteriaDescription: '...' });

    expect(res.status).toBe(400);
    expect(badgeService.createBadge).not.toHaveBeenCalled();
  });

  it('adminCreate succeeds with a valid Admin-submitted body', async () => {
    const res = await request(app)
      .post('/api/v1/admin/badges')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Quarter Champion',
        description: '...',
        category: 'STUDENT',
        criteriaDescription: 'Reach a 90-day streak',
      });

    expect(res.status).toBe(201);
  });

  it('adminAdjust (PATCH) succeeds with a valid Admin token', async () => {
    (badgeService.adminManageBadges as any).mockResolvedValue({ id: 'badge-1', isActive: false });

    const res = await request(app)
      .patch('/api/v1/admin/badges/badge-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ isActive: false });

    expect(res.status).toBe(200);
  });
});
