/**
 * tests/routes/studentProfile.routes.test.ts
 *
 * Journey step 2.4. Spec: `09-2-accounts-guardianship.md` §9.4.
 * Endpoints: `06-api/02-accounts-guardianship-api.md` §2.2
 *   GET /students/me/profile, PATCH /students/me/profile,
 *   PATCH /students/me/academic-profile — all Student|Parent.
 *
 * Integration (HTTP contract) tier — drives the real Express app via
 * supertest, with `studentProfile.service.ts` mocked. Proves routing →
 * middleware → controller wiring, not persistence.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/studentProfile.service.js', () => ({
  getProfile: vi.fn(),
  updateBasicProfile: vi.fn(),
  updateAcademicProfile: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    if (token === 'parent-token') return { id: 'parent-1', role: 'PARENT' };
    throw new Error('invalid token');
  }),
}));

import * as studentProfileService from '../../src/services/studentProfile.service.js';
import app from '../../src/app.js';

describe.skip('studentProfile.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (studentProfileService.getProfile as any).mockResolvedValue({ id: 'sp-1' });
    (studentProfileService.updateBasicProfile as any).mockResolvedValue({ id: 'sp-1' });
    (studentProfileService.updateAcademicProfile as any).mockResolvedValue({ id: 'sp-1' });
  });

  it.each([
    ['get', '/api/v1/students/me/profile'],
    ['patch', '/api/v1/students/me/profile'],
    ['patch', '/api/v1/students/me/academic-profile'],
  ])('%s %s requires auth — 401 with no Authorization header', async (method, path) => {
    const res = await (request(app) as any)[method](path).send({});

    expect(res.status).toBe(401);
  });

  it('GET /students/me/profile succeeds with a Student token', async () => {
    const res = await request(app)
      .get('/api/v1/students/me/profile')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(200);
  });

  it('GET /students/me/profile succeeds with a Parent token', async () => {
    const res = await request(app)
      .get('/api/v1/students/me/profile')
      .set('Authorization', 'Bearer parent-token');

    expect(res.status).toBe(200);
  });

  it('PATCH /students/me/academic-profile validates body — grade out of range rejected before the controller runs', async () => {
    const res = await request(app)
      .patch('/api/v1/students/me/academic-profile')
      .set('Authorization', 'Bearer student-token')
      .send({ grade: 99 });

    expect(res.status).toBe(400);
    expect(studentProfileService.updateAcademicProfile).not.toHaveBeenCalled();
  });

  it('PATCH /students/me/academic-profile accepts an empty partial update', async () => {
    const res = await request(app)
      .patch('/api/v1/students/me/academic-profile')
      .set('Authorization', 'Bearer student-token')
      .send({});

    expect(res.status).toBe(200);
  });
});
