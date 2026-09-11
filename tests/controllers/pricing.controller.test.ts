/**
 * tests/controllers/pricing.controller.test.ts
 *
 * Phase 7, step 7.11. Spec: `09-7-payments-earnings.md` §9.10 (controller half).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/pricing.service.js', () => ({
  getActiveConfig: vi.fn(),
  createAndActivateConfig: vi.fn(),
}));

import * as pricingService from '../../src/services/pricing.service.js';
import { adminUpdate, getActive } from '../../src/controllers/pricing.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('pricing.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getActive delegates to getActiveConfig with no arguments and responds 200', async () => {
    (pricingService.getActiveConfig as any).mockResolvedValue([]);
    const req = mockReq();
    const res = mockRes();

    await getActive(req, res, vi.fn());

    expect(pricingService.getActiveConfig).toHaveBeenCalledWith();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('adminUpdate delegates with req.params.format/req.body/req.user.id and responds 201', async () => {
    (pricingService.createAndActivateConfig as any).mockResolvedValue({
      id: 'pc-1',
      format: 'ONE_TO_ONE',
      isActive: true,
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' } as any,
      params: { format: 'ONE_TO_ONE' },
      body: {
        pricePerStudentPerHour: '375.00',
        totalPerHour: '375.00',
        platformSharePerHour: '125.00',
        tutorSharePerHour: '250.00',
      },
    });
    const res = mockRes();

    await adminUpdate(req, res, vi.fn());

    expect(pricingService.createAndActivateConfig).toHaveBeenCalledWith(
      'ONE_TO_ONE',
      req.body,
      'admin-1',
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
