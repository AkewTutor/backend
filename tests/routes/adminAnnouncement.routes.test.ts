/**
 * tests/routes/adminAnnouncement.routes.test.ts
 *
 * Journey step 1.18 (routes half). Spec: `09-1-shared-config.md` §9.15.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/adminAnnouncement.service.js', () => ({
  composePlatformAnnouncement: vi.fn(),
  adjustNotificationRules: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    throw new Error('invalid token');
  }),
}));

import * as adminAnnouncementService from '../../src/services/adminAnnouncement.service.js';
import app from '../../src/app.js';

describe('adminAnnouncement.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (adminAnnouncementService.composePlatformAnnouncement as any).mockResolvedValue({
      id: 'ann-1',
      title: 'Maintenance',
      audienceRoles: ['STUDENT'],
      createdAt: new Date().toISOString(),
    });
    (adminAnnouncementService.adjustNotificationRules as any).mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });
  });

  it('POST /admin/announcements requires Admin — 401 with no token', async () => {
    const res = await request(app)
      .post('/api/v1/admin/announcements')
      .send({ title: 'x', body: 'y', audienceRoles: ['STUDENT'] });

    expect(res.status).toBe(401);
  });

  it('POST /admin/announcements requires Admin — 403 with a Student token', async () => {
    const res = await request(app)
      .post('/api/v1/admin/announcements')
      .set('Authorization', 'Bearer student-token')
      .send({ title: 'x', body: 'y', audienceRoles: ['STUDENT'] });

    expect(res.status).toBe(403);
    expect(adminAnnouncementService.composePlatformAnnouncement).not.toHaveBeenCalled();
  });

  it('POST /admin/announcements succeeds with an Admin token', async () => {
    const res = await request(app)
      .post('/api/v1/admin/announcements')
      .set('Authorization', 'Bearer admin-token')
      .send({ title: 'x', body: 'y', audienceRoles: ['STUDENT'] });

    expect(res.status).toBe(201);
  });

  it('GET /admin/announcements requires Admin — 401 with no token', async () => {
    const res = await request(app).get('/api/v1/admin/announcements');

    expect(res.status).toBe(401);
  });

  it('GET /admin/announcements requires Admin — 403 with a Student token', async () => {
    const res = await request(app)
      .get('/api/v1/admin/announcements')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(403);
  });

  it('GET /admin/announcements succeeds with an Admin token', async () => {
    const res = await request(app)
      .get('/api/v1/admin/announcements')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
  });
});
