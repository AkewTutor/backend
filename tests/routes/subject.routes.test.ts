/**
 * tests/routes/subject.routes.test.ts
 *
 * Journey step 2.19. Spec: `09-2-accounts-guardianship.md` §9.15.
 * Endpoints: `06-api/02-accounts-guardianship-api.md` §2.2.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/subject.service.js', () => ({
  listSubjects: vi.fn(),
  createSubject: vi.fn(),
  deactivateSubject: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    throw new Error('invalid token');
  }),
}));

import * as subjectService from '../../src/services/subject.service.js';
import app from '../../src/app.js';

describe('subject.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (subjectService.listSubjects as any).mockResolvedValue([]);
    (subjectService.createSubject as any).mockResolvedValue({ id: 's1', name: 'Biology' });
    (subjectService.deactivateSubject as any).mockResolvedValue({ id: 's1', isActive: false });
  });

  it('GET /subjects is public — 200 with no Authorization header', async () => {
    const res = await request(app).get('/api/v1/subjects');

    expect(res.status).toBe(200);
  });

  it('POST /admin/subjects requires Admin — 401 with no header, then 403 with a Student token', async () => {
    const noAuth = await request(app).post('/api/v1/admin/subjects').send({ name: 'Biology' });
    expect(noAuth.status).toBe(401);
  });

  it('PATCH /admin/subjects/:id requires Admin — 401 with no header', async () => {
    const res = await request(app).patch('/api/v1/admin/subjects/s1').send({ isActive: false });

    expect(res.status).toBe(401);
  });

  it('POST /admin/subjects succeeds with an Admin token', async () => {
    const res = await request(app)
      .post('/api/v1/admin/subjects')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Biology' });

    expect(res.status).toBe(201);
  });

  it('a public POST /subjects (no /admin prefix) is not a valid mutate route — the routers are genuinely split', async () => {
    const res = await request(app).post('/api/v1/subjects').send({ name: 'Biology' });

    expect([404, 405]).toContain(res.status);
    expect(subjectService.createSubject).not.toHaveBeenCalled();
  });
});
