/**
 * tests/routes/policy.routes.test.ts
 *
 * Journey step 1.22. Spec: `09-1-shared-config.md` §9.17.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/policy.service.js', () => ({
  getCurrentPolicy: vi.fn(),
  publishNewVersion: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    throw new Error('invalid token');
  }),
}));

import * as policyService from '../../src/services/policy.service.js';
import app from '../../src/app.js';

describe('policy.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (policyService.getCurrentPolicy as any).mockResolvedValue({
      type: 'PRIVACY',
      version: 1,
      content: '# Privacy',
      publishedAt: new Date().toISOString(),
    });
    (policyService.publishNewVersion as any).mockResolvedValue({
      type: 'PRIVACY',
      version: 2,
      publishedAt: new Date().toISOString(),
    });
  });

  it('GET /policies/:type requires no auth', async () => {
    const res = await request(app).get('/api/v1/policies/PRIVACY');

    expect(res.status).toBe(200);
    expect(policyService.getCurrentPolicy).toHaveBeenCalledWith('PRIVACY');
  });

  it('GET /policies/:type rejects an invalid :type at the schema layer with 400', async () => {
    const res = await request(app).get('/api/v1/policies/NOT_A_REAL_TYPE');

    expect(res.status).toBe(400);
    expect(policyService.getCurrentPolicy).not.toHaveBeenCalled();
  });

  it('POST /policies/:type requires Admin — 401 with no token', async () => {
    const res = await request(app).post('/api/v1/policies/PRIVACY').send({ content: 'x' });

    expect(res.status).toBe(401);
  });

  it('POST /policies/:type requires Admin — 403 with a Student token', async () => {
    const res = await request(app)
      .post('/api/v1/policies/PRIVACY')
      .set('Authorization', 'Bearer student-token')
      .send({ content: 'x' });

    expect(res.status).toBe(403);
    expect(policyService.publishNewVersion).not.toHaveBeenCalled();
  });

  it('POST /policies/:type succeeds with an Admin token', async () => {
    const res = await request(app)
      .post('/api/v1/policies/PRIVACY')
      .set('Authorization', 'Bearer admin-token')
      .send({ content: '# Privacy v2' });

    expect(res.status).toBe(201);
  });
});
