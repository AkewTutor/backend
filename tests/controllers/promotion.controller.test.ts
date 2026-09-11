/**
 * tests/controllers/promotion.controller.test.ts
 *
 * Phase 7, step 7.25. Spec: `09-7-payments-earnings.md` §9.20 (controller half).
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/promotion.service.js', () => ({
  createPromotion: vi.fn(),
  listActivePromotions: vi.fn(),
  applyToPayment: vi.fn(),
  updatePromotion: vi.fn(),
}));

import * as promotionService from '../../src/services/promotion.service.js';
import { adminCreate, adminEdit, listActive } from '../../src/controllers/promotion.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('promotion.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listActive delegates to listActivePromotions with no arguments and responds 200', async () => {
    (promotionService.listActivePromotions as any).mockResolvedValue([]);
    const req = mockReq();
    const res = mockRes();

    await listActive(req, res, vi.fn());

    expect(promotionService.listActivePromotions).toHaveBeenCalledWith();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('adminCreate delegates with req.body/req.user.id and responds 201', async () => {
    (promotionService.createPromotion as any).mockResolvedValue({
      id: 'promo-1',
      code: 'BACKTOSCHOOL2026',
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' } as any,
      body: {
        code: 'BACKTOSCHOOL2026',
        discountType: 'PERCENT',
        discountValue: '10',
        validFrom: '2026-09-01T00:00:00.000Z',
        validTo: '2026-09-30T00:00:00.000Z',
      },
    });
    const res = mockRes();

    await adminCreate(req, res, vi.fn());

    expect(promotionService.createPromotion).toHaveBeenCalledWith(req.body, 'admin-1');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('adminEdit delegates to updatePromotion with req.params.id/req.body and responds 200', async () => {
    (promotionService.updatePromotion as any).mockResolvedValue({
      id: 'promo-1',
      code: 'BACKTOSCHOOL2026',
      discountValue: '15',
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' } as any,
      params: { id: 'promo-1' },
      body: { discountValue: '15' },
    });
    const res = mockRes();

    await adminEdit(req, res, vi.fn());

    expect(promotionService.updatePromotion).toHaveBeenCalledWith('promo-1', req.body);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
