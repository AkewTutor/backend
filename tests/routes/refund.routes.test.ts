/**
 * tests/routes/refund.routes.test.ts
 *
 * Phase 7, step 7.16. Spec: `09-7-payments-earnings.md` §9.13 (routes half).
 * OWASP: A01:2021 – Broken Access Control.
 *
 * Integration (HTTP contract) tier — drives the real Express app via
 * supertest, mounted at `/admin/refunds`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    refund: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/refund.service.js', () => ({
  approveRefund: vi.fn(),
  rejectRefund: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'parent-token') return { id: 'parent-1', role: 'PARENT' };
    throw new Error('invalid token');
  }),
}));

import { prisma } from '../../src/config/db.js';
import * as refundService from '../../src/services/refund.service.js';
import app from '../../src/app.js';

describe.skip('refund.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.refund.findMany as any).mockResolvedValue([
      { id: 'refund-1', status: 'PENDING', amount: '300.00', createdAt: new Date() },
    ]);
    (refundService.approveRefund as any).mockResolvedValue({
      id: 'refund-1',
      status: 'APPROVED',
      amount: '300.00',
      approvedById: 'admin-1',
      approvedAt: new Date(),
    });
    (refundService.rejectRefund as any).mockResolvedValue({
      id: 'refund-1',
      status: 'REJECTED',
      rejectedById: 'admin-1',
      rejectedAt: new Date(),
      rejectionReason: 'Student-caused disruption',
    });
  });

  it.each([
    ['get' as const, '/api/v1/admin/refunds'],
    ['post' as const, '/api/v1/admin/refunds/refund-1/approve'],
    ['post' as const, '/api/v1/admin/refunds/refund-1/reject'],
  ])('%s %s requires Admin — 401 with no token', async (method, path) => {
    const res = await request(app)[method](path).send({ rejectionReason: 'x' });

    expect(res.status).toBe(401);
  });

  it.each([
    ['get' as const, '/api/v1/admin/refunds'],
    ['post' as const, '/api/v1/admin/refunds/refund-1/approve'],
    ['post' as const, '/api/v1/admin/refunds/refund-1/reject'],
  ])('%s %s requires Admin — 403 with a Parent token', async (method, path) => {
    const res = await request(app)
      [method](path)
      .set('Authorization', 'Bearer parent-token')
      .send({ rejectionReason: 'x' });

    expect(res.status).toBe(403);
  });

  it('GET /admin/refunds succeeds with an Admin token', async () => {
    const res = await request(app)
      .get('/api/v1/admin/refunds')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
  });

  it('POST /admin/refunds/:id/approve succeeds with an Admin token', async () => {
    const res = await request(app)
      .post('/api/v1/admin/refunds/refund-1/approve')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
  });

  it('POST /admin/refunds/:id/reject validates rejectionReason — an empty body is rejected with 400, controller never called', async () => {
    const res = await request(app)
      .post('/api/v1/admin/refunds/refund-1/reject')
      .set('Authorization', 'Bearer admin-token')
      .send({});

    expect(res.status).toBe(400);
    expect(refundService.rejectRefund).not.toHaveBeenCalled();
  });

  it('POST /admin/refunds/:id/reject succeeds with an Admin token and a valid rejectionReason', async () => {
    const res = await request(app)
      .post('/api/v1/admin/refunds/refund-1/reject')
      .set('Authorization', 'Bearer admin-token')
      .send({ rejectionReason: 'Student-caused disruption' });

    expect(res.status).toBe(200);
  });
});
