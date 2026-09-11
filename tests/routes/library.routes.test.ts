/**
 * tests/routes/library.routes.test.ts
 *
 * Journey step 4.16. Spec: `09-4-class-delivery-library.md` §9.13.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/library.service.js', () => ({
  uploadMaterial: vi.fn(),
  listCohortMaterials: vi.fn(),
  adminManageLibrary: vi.fn(),
  adminRecordingCompliance: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    throw new Error('invalid token');
  }),
}));

import * as libraryService from '../../src/services/library.service.js';
import app from '../../src/app.js';

describe.skip('library.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (libraryService.uploadMaterial as any).mockResolvedValue({
      id: 'material-1',
      cohortId: 'cohort-1',
      title: 'Algebra Practice Set 3',
      fileType: 'PDF',
      fileUrl: 'https://r2/x.pdf',
    });
    (libraryService.listCohortMaterials as any).mockResolvedValue([]);
    (libraryService.adminManageLibrary as any).mockResolvedValue({
      id: 'material-1',
      title: 'Revised',
    });
    (libraryService.adminRecordingCompliance as any).mockResolvedValue({
      sessions: [],
      page: 1,
      limit: 20,
      total: 0,
    });
  });

  it('all 4 routes require auth — 401 with no Authorization header', async () => {
    const upload = await request(app).post('/api/v1/library/materials').send({});
    const list = await request(app).get('/api/v1/library/cohorts/cohort-1/materials');
    const override = await request(app)
      .patch('/api/v1/admin/library/materials/material-1')
      .send({});
    const compliance = await request(app).get('/api/v1/admin/library/recording-compliance');

    expect(upload.status).toBe(401);
    expect(list.status).toBe(401);
    expect(override.status).toBe(401);
    expect(compliance.status).toBe(401);
  });

  it('admin-only routes reject a non-Admin caller with 403', async () => {
    const override = await request(app)
      .patch('/api/v1/admin/library/materials/material-1')
      .set('Authorization', 'Bearer tutor-token')
      .send({ title: 'x' });
    const compliance = await request(app)
      .get('/api/v1/admin/library/recording-compliance')
      .set('Authorization', 'Bearer tutor-token');

    expect(override.status).toBe(403);
    expect(compliance.status).toBe(403);
  });

  it('GET /library/cohorts/:cohortId/materials with a valid token reaches the (mocked) service', async () => {
    const res = await request(app)
      .get('/api/v1/library/cohorts/cohort-1/materials')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(200);
    expect(libraryService.listCohortMaterials).toHaveBeenCalledWith('student-1', 'cohort-1');
  });

  it('PATCH /admin/library/materials/:id with a valid Admin token reaches the (mocked) service', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/library/materials/material-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ title: 'Revised' });

    expect(res.status).toBe(200);
    expect(libraryService.adminManageLibrary).toHaveBeenCalledWith('material-1', 'admin-1', {
      title: 'Revised',
    });
  });
});
