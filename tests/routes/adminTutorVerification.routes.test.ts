/**
 * tests/routes/adminTutorVerification.routes.test.ts
 *
 * Journey step 2.22. Spec: `09-2-accounts-guardianship.md` §9.17.
 * Endpoints: `06-api/02-accounts-guardianship-api.md` §2.2.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/adminTutorVerification.service.js', () => ({
  listPendingTutors: vi.fn(),
  approveTutor: vi.fn(),
  rejectTutor: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    throw new Error('invalid token');
  }),
}));

import * as adminTutorVerificationService from '../../src/services/adminTutorVerification.service.js';
import app from '../../src/app.js';

describe.skip('adminTutorVerification.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (adminTutorVerificationService.listPendingTutors as any).mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    (adminTutorVerificationService.approveTutor as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'VERIFIED',
    });
    (adminTutorVerificationService.rejectTutor as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'REJECTED',
    });
  });

  it.each([
    ['get', '/api/v1/admin/tutors/pending'],
    ['post', '/api/v1/admin/tutors/t1/approve'],
    ['post', '/api/v1/admin/tutors/t1/reject'],
  ])('%s %s requires Admin — 401 with no header', async (method, path) => {
    const res = await (request(app) as any)[method](path).send({});

    expect(res.status).toBe(401);
  });

  it.each([
    ['get', '/api/v1/admin/tutors/pending'],
    ['post', '/api/v1/admin/tutors/t1/approve'],
    ['post', '/api/v1/admin/tutors/t1/reject'],
  ])('%s %s requires Admin — 403 with a Tutor token', async (method, path) => {
    const res = await (request(app) as any)
      [method](path)
      .set('Authorization', 'Bearer tutor-token')
      .send({});

    expect(res.status).toBe(403);
  });

  it('GET /admin/tutors/pending succeeds with an Admin token', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tutors/pending')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
  });
});
