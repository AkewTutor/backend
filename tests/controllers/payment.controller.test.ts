/**
 * tests/controllers/payment.controller.test.ts
 *
 * Phase 7, step 7.4. Spec: `09-7-payments-earnings.md` §9.5 (controller half).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/payment.service.js', () => ({
  initiatePayment: vi.fn(),
  handleChapaWebhook: vi.fn(),
  getPaymentHistory: vi.fn(),
}));

import * as paymentService from '../../src/services/payment.service.js';
import { getHistory, initiate, webhook } from '../../src/controllers/payment.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, headers: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('payment.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initiate forwards req.user.id/req.user.role/req.body fields, and never a client-suppliable payer', async () => {
    (paymentService.initiatePayment as any).mockResolvedValue({
      paymentId: 'pay-1',
      chapaCheckoutUrl: 'https://checkout.chapa.co/x',
      amount: '350.00',
      status: 'PENDING',
    });
    const req = mockReq({
      user: { id: 'student-1', role: 'STUDENT' } as any,
      body: { cohortMembershipId: 'membership-1', promotionCode: 'PROMO1' },
    });
    const res = mockRes();

    await initiate(req, res, vi.fn());

    expect(paymentService.initiatePayment).toHaveBeenCalledWith(
      'student-1',
      'STUDENT',
      'membership-1',
      'PROMO1',
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('webhook delegates to handleChapaWebhook with the raw body and Chapa signature header', async () => {
    (paymentService.handleChapaWebhook as any).mockResolvedValue({ received: true });
    const rawBody = Buffer.from('{"event":"SUCCESS"}');
    const req = mockReq({
      rawBody,
      headers: { 'chapa-signature': 'sig-abc' },
    } as any);
    const res = mockRes();

    await webhook(req, res, vi.fn());

    expect(paymentService.handleChapaWebhook).toHaveBeenCalledWith(rawBody, 'sig-abc');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getHistory forwards req.user.id/req.user.role, never a client-suppliable caller id', async () => {
    (paymentService.getPaymentHistory as any).mockResolvedValue({
      payments: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({
      user: { id: 'student-1', role: 'STUDENT' } as any,
      query: { page: '1', limit: '20' },
    });
    const res = mockRes();

    await getHistory(req, res, vi.fn());

    expect(paymentService.getPaymentHistory).toHaveBeenCalledWith(
      'student-1',
      'STUDENT',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getHistory (Parent) forwards req.query.studentId for the service-layer relationship check', async () => {
    (paymentService.getPaymentHistory as any).mockResolvedValue({
      payments: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({
      user: { id: 'parent-1', role: 'PARENT' } as any,
      query: { studentId: 'student-target', page: '1', limit: '20' },
    });
    const res = mockRes();

    await getHistory(req, res, vi.fn());

    expect(paymentService.getPaymentHistory).toHaveBeenCalledWith(
      'parent-1',
      'PARENT',
      'student-target',
      expect.anything(),
      expect.anything(),
    );
  });

  it('getHistory (Student) ignores any studentId override in the query', async () => {
    (paymentService.getPaymentHistory as any).mockResolvedValue({
      payments: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({
      user: { id: 'student-1', role: 'STUDENT' } as any,
      query: { studentId: 'someone-else', page: '1', limit: '20' },
    });
    const res = mockRes();

    await getHistory(req, res, vi.fn());

    const calledStudentIdArg = (paymentService.getPaymentHistory as any).mock.calls[0][2];
    expect(calledStudentIdArg).not.toBe('someone-else');
  });
});
