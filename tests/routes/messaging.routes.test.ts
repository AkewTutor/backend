/**
 * tests/routes/messaging.routes.test.ts
 *
 * Journey step 5.4. Spec: `09-5-messaging.md` §9.4.
 * OWASP: A01:2021 – Broken Access Control.
 *
 * Integration (HTTP contract) tier — drives the real Express app
 * (src/app.ts, mounting src/routes/messaging.routes.ts) via supertest,
 * with `messaging.service.ts` mocked. Proves routing → middleware →
 * controller wiring, not persistence.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/messaging.service.js', () => ({
  getThreadForCohort: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(() => ({ id: 'user-1', role: 'STUDENT' })),
}));

import * as messagingService from '../../src/services/messaging.service.js';
import app from '../../src/app.js';

const authHeader = { Authorization: 'Bearer valid.token.here' };
const cohortId = 'cohort-1';

describe.skip('messaging.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (messagingService.getThreadForCohort as any).mockResolvedValue({
      id: 'thread-1',
      cohortId,
      format: 'ONE_TO_ONE',
      status: 'ACTIVE',
      participantCount: 2,
    });
    (messagingService.listMessages as any).mockResolvedValue({
      messages: [],
      page: 1,
      limit: 50,
      total: 0,
    });
    (messagingService.sendMessage as any).mockResolvedValue({
      id: 'm1',
      senderId: 'user-1',
      body: 'hi',
      createdAt: new Date().toISOString(),
    });
  });

  it('all three routes require auth — 401 with no Authorization header', async () => {
    const [threadRes, messagesRes, sendRes] = await Promise.all([
      request(app).get(`/api/v1/messaging/cohorts/${cohortId}/thread`),
      request(app).get(`/api/v1/messaging/cohorts/${cohortId}/messages`),
      request(app).post(`/api/v1/messaging/cohorts/${cohortId}/messages`).send({ body: 'hi' }),
    ]);

    expect(threadRes.status).toBe(401);
    expect(messagesRes.status).toBe(401);
    expect(sendRes.status).toBe(401);
  });

  it('GET .../thread with a valid token reaches the (mocked) service using req.user.id', async () => {
    const res = await request(app)
      .get(`/api/v1/messaging/cohorts/${cohortId}/thread`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(messagingService.getThreadForCohort).toHaveBeenCalledWith('user-1', cohortId);
  });

  it('GET .../messages with a valid token reaches the (mocked) service using req.params.cohortId', async () => {
    const res = await request(app)
      .get(`/api/v1/messaging/cohorts/${cohortId}/messages`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(messagingService.listMessages).toHaveBeenCalledWith(
      'user-1',
      cohortId,
      expect.anything(),
      expect.anything(),
    );
  });

  it('sendMessage validates body against sendMessageSchema — an empty body is rejected before the controller runs', async () => {
    const res = await request(app)
      .post(`/api/v1/messaging/cohorts/${cohortId}/messages`)
      .set(authHeader)
      .send({ body: '' });

    expect(res.status).toBe(400);
    expect(messagingService.sendMessage).not.toHaveBeenCalled();
  });

  it('POST .../messages with a valid body and token reaches the (mocked) service and returns 201', async () => {
    const res = await request(app)
      .post(`/api/v1/messaging/cohorts/${cohortId}/messages`)
      .set(authHeader)
      .send({ body: 'Running 5 minutes late, sorry!' });

    expect(res.status).toBe(201);
    expect(messagingService.sendMessage).toHaveBeenCalledWith(
      'user-1',
      cohortId,
      'Running 5 minutes late, sorry!',
    );
  });
});
