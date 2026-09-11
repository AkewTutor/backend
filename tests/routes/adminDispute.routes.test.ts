/**
 * tests/routes/adminDispute.routes.test.ts
 *
 * Journey step 8.6 (routes half). Spec: `09-8-support-trust-admin.md` §9.6.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/adminDispute.service.js', () => ({
  listDisputeQueue: vi.fn(),
  getDisputeForReview: vi.fn(),
  resolveDispute: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'parent-token') return { id: 'parent-1', role: 'PARENT' };
    throw new Error('invalid token');
  }),
}));

import * as adminDisputeService from '../../src/services/adminDispute.service.js';
import app from '../../src/app.js';

describe.skip('adminDispute.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (adminDisputeService.listDisputeQueue as any).mockResolvedValue({
      complaints: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    (adminDisputeService.getDisputeForReview as any).mockResolvedValue({
      id: 'c1',
      status: 'OPEN',
    });
    (adminDisputeService.resolveDispute as any).mockResolvedValue({ id: 'c1', status: 'RESOLVED' });
  });

  it('all three routes require Admin — 401 with no Authorization header', async () => {
    const list = await request(app).get('/api/v1/admin/disputes');
    const detail = await request(app).get('/api/v1/admin/disputes/c1');
    const patch = await request(app)
      .patch('/api/v1/admin/disputes/c1')
      .send({ status: 'DISMISSED', resolutionNotes: 'ok' });

    expect(list.status).toBe(401);
    expect(detail.status).toBe(401);
    expect(patch.status).toBe(401);
  });

  it('all three routes require Admin — 403 with a Parent token', async () => {
    const list = await request(app)
      .get('/api/v1/admin/disputes')
      .set('Authorization', 'Bearer parent-token');
    const detail = await request(app)
      .get('/api/v1/admin/disputes/c1')
      .set('Authorization', 'Bearer parent-token');
    const patch = await request(app)
      .patch('/api/v1/admin/disputes/c1')
      .set('Authorization', 'Bearer parent-token')
      .send({ status: 'DISMISSED', resolutionNotes: 'ok' });

    expect(list.status).toBe(403);
    expect(detail.status).toBe(403);
    expect(patch.status).toBe(403);
    expect(adminDisputeService.resolveDispute).not.toHaveBeenCalled();
  });

  it('resolveDispute forwards req.user.id as adminId, never a client-suppliable admin id', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/disputes/c1')
      .set('Authorization', 'Bearer admin-token')
      .send({ status: 'DISMISSED', resolutionNotes: 'ok', adminId: 'someone-else' });

    expect(res.status).toBe(200);
    expect(adminDisputeService.resolveDispute).toHaveBeenCalledWith(
      'c1',
      'admin-1',
      expect.objectContaining({ status: 'DISMISSED' }),
    );
  });

  it('resolveDispute validates body — a RESOLVED submission with no resolutionAction is rejected', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/disputes/c1')
      .set('Authorization', 'Bearer admin-token')
      .send({ status: 'RESOLVED', resolutionNotes: '...' });

    expect(res.status).toBe(400);
    expect(adminDisputeService.resolveDispute).not.toHaveBeenCalled();
  });

  it('GET /admin/disputes succeeds with an Admin token', async () => {
    const res = await request(app)
      .get('/api/v1/admin/disputes')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
  });
});
