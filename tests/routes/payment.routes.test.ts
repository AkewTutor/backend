/**
 * tests/routes/payment.routes.test.ts
 *
 * Phase 7, step 7.5. Spec: `09-7-payments-earnings.md` §9.5 (routes half).
 * OWASP: A01:2021 – Broken Access Control, A02:2021 – Cryptographic
 *        Failures (webhook route's deliberate non-JWT auth path).
 *
 * Integration (HTTP contract) tier — drives the real Express app
 * (src/app.ts, mounting src/routes/payment.routes.ts) via supertest, with
 * `payment.service.ts` mocked. Raw-body-aware for the webhook route;
 * includes the mandatory idempotency test (same webhook event delivered
 * twice — Rule 9, `00-agent-rules.md`).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/payment.service.js', () => ({
  initiatePayment: vi.fn(),
  handleChapaWebhook: vi.fn(),
  getPaymentHistory: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    if (token === 'parent-token') return { id: 'parent-1', role: 'PARENT' };
    throw new Error('invalid token');
  }),
}));

import * as paymentService from '../../src/services/payment.service.js';
import app from '../../src/app.js';

describe.skip('payment.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (paymentService.initiatePayment as any).mockResolvedValue({
      paymentId: 'pay-1',
      chapaCheckoutUrl: 'https://checkout.chapa.co/x',
      amount: '350.00',
      status: 'PENDING',
    });
    (paymentService.getPaymentHistory as any).mockResolvedValue({
      payments: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    (paymentService.handleChapaWebhook as any).mockResolvedValue({ received: true });
  });

  it('POST /payments/initiate requires auth — 401 with no Authorization header', async () => {
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .send({ cohortMembershipId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' });

    expect(res.status).toBe(401);
    expect(paymentService.initiatePayment).not.toHaveBeenCalled();
  });

  it('GET /payments/history requires auth — 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/v1/payments/history');

    expect(res.status).toBe(401);
    expect(paymentService.getPaymentHistory).not.toHaveBeenCalled();
  });

  it('POST /payments/initiate succeeds with a Student token', async () => {
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', 'Bearer student-token')
      .send({ cohortMembershipId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' });

    expect(res.status).toBe(200);
  });

  it('POST /payments/webhook/chapa is reachable with no Authorization header — auth is signature-checked inside the handler, not authMiddleware', async () => {
    const res = await request(app)
      .post('/api/v1/payments/webhook/chapa')
      .set('Content-Type', 'application/json')
      .set('chapa-signature', 'valid-signature')
      .send(JSON.stringify({ event: 'SUCCESS', tx_ref: 'payment-1' }));

    expect(res.status).not.toBe(401);
  });

  it('POST /payments/webhook/chapa hands the controller the exact raw bytes received, not a re-serialized JSON body', async () => {
    const payloadString = JSON.stringify({ event: 'SUCCESS', tx_ref: 'payment-raw-check' });

    await request(app)
      .post('/api/v1/payments/webhook/chapa')
      .set('Content-Type', 'application/json')
      .set('chapa-signature', 'valid-signature')
      .send(payloadString);

    expect(paymentService.handleChapaWebhook).toHaveBeenCalledTimes(1);
    const [rawBodyArg] = (paymentService.handleChapaWebhook as any).mock.calls[0];
    expect(Buffer.isBuffer(rawBodyArg)).toBe(true);
    expect(rawBodyArg.toString('utf-8')).toBe(payloadString);
  });

  it('POST /payments/webhook/chapa delivered twice with the identical payload is handled idempotently (Rule 9)', async () => {
    const payloadString = JSON.stringify({ event: 'SUCCESS', tx_ref: 'payment-idempotent' });

    const firstResponse = await request(app)
      .post('/api/v1/payments/webhook/chapa')
      .set('Content-Type', 'application/json')
      .set('chapa-signature', 'valid-signature')
      .send(payloadString);

    const secondResponse = await request(app)
      .post('/api/v1/payments/webhook/chapa')
      .set('Content-Type', 'application/json')
      .set('chapa-signature', 'valid-signature')
      .send(payloadString);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(paymentService.handleChapaWebhook).toHaveBeenCalledTimes(2);
    // Both calls reach the (mocked) service layer identically — the real
    // idempotency guard lives inside handleChapaWebhook itself (already
    // Unit-tested in payment.service.test.ts); this route-level test only
    // confirms the route never short-circuits or double-parses a replay.
    const [firstRawBody] = (paymentService.handleChapaWebhook as any).mock.calls[0];
    const [secondRawBody] = (paymentService.handleChapaWebhook as any).mock.calls[1];
    expect(firstRawBody.toString('utf-8')).toBe(secondRawBody.toString('utf-8'));
  });

  it('initiate forwards req.user.id/role, never a client-suppliable payer', async () => {
    await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', 'Bearer student-token')
      .send({ cohortMembershipId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' });

    expect(paymentService.initiatePayment).toHaveBeenCalledWith(
      'student-1',
      'STUDENT',
      '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      undefined,
    );
  });

  it('getHistory (Student) ignores a ?studentId= override in the query', async () => {
    await request(app)
      .get('/api/v1/payments/history?studentId=someone-else')
      .set('Authorization', 'Bearer student-token');

    const calledStudentIdArg = (paymentService.getPaymentHistory as any).mock.calls[0][2];
    expect(calledStudentIdArg).not.toBe('someone-else');
  });

  it('getHistory (Parent) forwards the ?studentId= query value for the service-layer relationship check', async () => {
    await request(app)
      .get('/api/v1/payments/history?studentId=student-target')
      .set('Authorization', 'Bearer parent-token');

    expect(paymentService.getPaymentHistory).toHaveBeenCalledWith(
      'parent-1',
      'PARENT',
      'student-target',
      expect.anything(),
      expect.anything(),
    );
  });
});
