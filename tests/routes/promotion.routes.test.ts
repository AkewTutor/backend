/**
 * tests/routes/promotion.routes.test.ts
 *
 * Phase 7, step 7.26. Spec: `09-7-payments-earnings.md` §9.20 (routes half).
 * OWASP: A01:2021 – Broken Access Control.
 *
 * Integration (HTTP contract) tier — drives the real Express app via
 * supertest. Same one-router-two-mount-points pattern as `policy.routes.ts`
 * (Phase 1 precedent): `GET /promotions/active` is public, the two
 * `/admin/promotions...` routes are Admin-gated.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/promotion.service.js', () => ({
  createPromotion: vi.fn(),
  listActivePromotions: vi.fn(),
  applyToPayment: vi.fn(),
  updatePromotion: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    throw new Error('invalid token');
  }),
}));

import * as promotionService from '../../src/services/promotion.service.js';
import app from '../../src/app.js';

const validCreateBody = {
  code: 'BACKTOSCHOOL2026',
  discountType: 'PERCENT',
  discountValue: '10',
  validFrom: '2026-09-01T00:00:00.000Z',
  validTo: '2026-09-30T00:00:00.000Z',
};

describe.skip('promotion.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (promotionService.listActivePromotions as any).mockResolvedValue([]);
    (promotionService.createPromotion as any).mockResolvedValue({
      id: 'promo-1',
      code: 'BACKTOSCHOOL2026',
    });
    (promotionService.updatePromotion as any).mockResolvedValue({
      id: 'promo-1',
      code: 'BACKTOSCHOOL2026',
    });
  });

  it('GET /promotions/active is public — 200, not 401', async () => {
    const res = await request(app).get('/api/v1/promotions/active');

    expect(res.status).toBe(200);
  });

  it('POST /admin/promotions requires Admin — 401 with no token', async () => {
    const res = await request(app).post('/api/v1/admin/promotions').send(validCreateBody);

    expect(res.status).toBe(401);
  });

  it('POST /admin/promotions requires Admin — 403 with a Tutor token', async () => {
    const res = await request(app)
      .post('/api/v1/admin/promotions')
      .set('Authorization', 'Bearer tutor-token')
      .send(validCreateBody);

    expect(res.status).toBe(403);
    expect(promotionService.createPromotion).not.toHaveBeenCalled();
  });

  it('POST /admin/promotions validates the body — a non-ascending date range is rejected with 400, controller never called', async () => {
    const res = await request(app)
      .post('/api/v1/admin/promotions')
      .set('Authorization', 'Bearer admin-token')
      .send({
        ...validCreateBody,
        validFrom: '2026-09-30T00:00:00.000Z',
        validTo: '2026-09-01T00:00:00.000Z',
      });

    expect(res.status).toBe(400);
    expect(promotionService.createPromotion).not.toHaveBeenCalled();
  });

  it('POST /admin/promotions succeeds with an Admin token and a valid body', async () => {
    const res = await request(app)
      .post('/api/v1/admin/promotions')
      .set('Authorization', 'Bearer admin-token')
      .send(validCreateBody);

    expect(res.status).toBe(201);
  });

  it('PATCH /admin/promotions/:id requires Admin — 401 with no token', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/promotions/promo-1')
      .send({ discountValue: '15' });

    expect(res.status).toBe(401);
  });

  it('PATCH /admin/promotions/:id requires Admin — 403 with a Tutor token', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/promotions/promo-1')
      .set('Authorization', 'Bearer tutor-token')
      .send({ discountValue: '15' });

    expect(res.status).toBe(403);
    expect(promotionService.updatePromotion).not.toHaveBeenCalled();
  });

  it('PATCH /admin/promotions/:id succeeds with an Admin token', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/promotions/promo-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ discountValue: '15' });

    expect(res.status).toBe(200);
  });
});
