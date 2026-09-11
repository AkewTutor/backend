/**
 * tests/routes/pricing.routes.test.ts
 *
 * Phase 7, step 7.12. Spec: `09-7-payments-earnings.md` §9.10 (routes half).
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/pricing.service.js', () => ({
  getActiveConfig: vi.fn(),
  createAndActivateConfig: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    throw new Error('invalid token');
  }),
}));

import * as pricingService from '../../src/services/pricing.service.js';
import app from '../../src/app.js';

const validSplit = {
  pricePerStudentPerHour: '375.00',
  totalPerHour: '375.00',
  platformSharePerHour: '125.00',
  tutorSharePerHour: '250.00',
};

describe.skip('pricing.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (pricingService.getActiveConfig as any).mockResolvedValue([]);
    (pricingService.createAndActivateConfig as any).mockResolvedValue({
      id: 'pc-1',
      format: 'ONE_TO_ONE',
      isActive: true,
    });
  });

  it('GET /pricing is public — 200, not 401', async () => {
    const res = await request(app).get('/api/v1/pricing');

    expect(res.status).toBe(200);
  });

  it('PUT /admin/pricing/:format requires Admin — 401 with no token', async () => {
    const res = await request(app).put('/api/v1/admin/pricing/ONE_TO_ONE').send(validSplit);

    expect(res.status).toBe(401);
  });

  it('PUT /admin/pricing/:format requires Admin — 403 with a Tutor token', async () => {
    const res = await request(app)
      .put('/api/v1/admin/pricing/ONE_TO_ONE')
      .set('Authorization', 'Bearer tutor-token')
      .send(validSplit);

    expect(res.status).toBe(403);
    expect(pricingService.createAndActivateConfig).not.toHaveBeenCalled();
  });

  it('PUT /admin/pricing/:format validates the body — a non-reconciling split is rejected, controller never called', async () => {
    const res = await request(app)
      .put('/api/v1/admin/pricing/ONE_TO_ONE')
      .set('Authorization', 'Bearer admin-token')
      .send({
        pricePerStudentPerHour: '100.00',
        totalPerHour: '100.00',
        platformSharePerHour: '40.00',
        tutorSharePerHour: '50.00',
      });

    expect(res.status).toBe(400);
    expect(pricingService.createAndActivateConfig).not.toHaveBeenCalled();
  });

  it('PUT /admin/pricing/:format succeeds with an Admin token and a reconciled split', async () => {
    const res = await request(app)
      .put('/api/v1/admin/pricing/ONE_TO_ONE')
      .set('Authorization', 'Bearer admin-token')
      .send(validSplit);

    expect(res.status).toBe(201);
  });
});
