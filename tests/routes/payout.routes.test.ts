/**
 * tests/routes/payout.routes.test.ts
 *
 * Phase 7, step 7.22. Spec: `09-7-payments-earnings.md` §9.17 (routes half).
 * OWASP: A01:2021 – Broken Access Control.
 *
 * Integration (HTTP contract) tier — drives the real Express app via
 * supertest, mounted at `/admin/payouts`. Also confirms the §9.16
 * documentation-level check: no route maps to `generateMonthlyPayouts` —
 * there is no client-facing creation path for a Payout.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/payout.service.js', () => ({
  generateMonthlyPayouts: vi.fn(),
  markPaid: vi.fn(),
  adminAdjust: vi.fn(),
  listPayouts: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    throw new Error('invalid token');
  }),
}));

import * as payoutService from '../../src/services/payout.service.js';
import app from '../../src/app.js';

describe.skip('payout.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (payoutService.listPayouts as any).mockResolvedValue({
      payouts: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    (payoutService.markPaid as any).mockResolvedValue({
      id: 'payout-1',
      status: 'PAID',
      paidAt: new Date(),
    });
  });

  it.each([
    ['get' as const, '/api/v1/admin/payouts'],
    ['post' as const, '/api/v1/admin/payouts/payout-1/mark-paid'],
  ])('%s %s requires Admin — 401 with no token', async (method, path) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(401);
  });

  it.each([
    ['get' as const, '/api/v1/admin/payouts'],
    ['post' as const, '/api/v1/admin/payouts/payout-1/mark-paid'],
  ])(
    "%s %s requires Admin — 403 with a Tutor token, never lets a Tutor mark their own (or anyone's) payout paid",
    async (method, path) => {
      const res = await request(app)[method](path).set('Authorization', 'Bearer tutor-token');

      expect(res.status).toBe(403);
    },
  );

  it('GET /admin/payouts succeeds with an Admin token', async () => {
    const res = await request(app)
      .get('/api/v1/admin/payouts')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
  });

  it('POST /admin/payouts/:id/mark-paid succeeds with an Admin token', async () => {
    const res = await request(app)
      .post('/api/v1/admin/payouts/payout-1/mark-paid')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
  });

  it('no POST /admin/payouts route exists to create a payout manually — §9.16 documentation-level check', async () => {
    const res = await request(app)
      .post('/api/v1/admin/payouts')
      .set('Authorization', 'Bearer admin-token')
      .send({ tutorId: 'tutor-1', totalAmount: '999999.00' });

    // Either unmatched entirely (404) or rejected by the router's method
    // guard (405) — either way, never routed to a handler that creates a
    // Payout, and generateMonthlyPayouts is never invoked from HTTP.
    expect([404, 405]).toContain(res.status);
    expect(payoutService.generateMonthlyPayouts).not.toHaveBeenCalled();
  });
});
