/**
 * tests/routes/adminMessaging.routes.test.ts
 *
 * Journey step 5.7. Spec: `09-5-messaging.md` §9.6.
 * OWASP: A01:2021 – Broken Access Control.
 *
 * Integration (HTTP contract) tier — drives the real Express app
 * (src/app.ts, mounting src/routes/adminMessaging.routes.ts) via
 * supertest, with `adminMessaging.service.ts` mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/adminMessaging.service.js', () => ({
  viewThreadForDispute: vi.fn(),
  closeThread: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    throw new Error('invalid token');
  }),
}));

import * as adminMessagingService from '../../src/services/adminMessaging.service.js';
import app from '../../src/app.js';

const threadId = 'thread-1';

describe.skip('adminMessaging.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (adminMessagingService.viewThreadForDispute as any).mockResolvedValue({
      id: threadId,
      cohortId: 'cohort-1',
      status: 'ACTIVE',
      messages: [],
      page: 1,
      limit: 50,
      total: 0,
    });
    (adminMessagingService.closeThread as any).mockResolvedValue({
      id: threadId,
      status: 'CLOSED_BY_ADMIN',
      closedById: 'admin-1',
      closedAt: new Date().toISOString(),
    });
  });

  it('GET /admin/messaging/threads/:threadId requires Admin — 401 with no token', async () => {
    const res = await request(app).get(`/api/v1/admin/messaging/threads/${threadId}`);

    expect(res.status).toBe(401);
  });

  it('GET /admin/messaging/threads/:threadId requires Admin — 403 with a Tutor token', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/messaging/threads/${threadId}`)
      .set('Authorization', 'Bearer tutor-token');

    expect(res.status).toBe(403);
    expect(adminMessagingService.viewThreadForDispute).not.toHaveBeenCalled();
  });

  it('GET /admin/messaging/threads/:threadId succeeds with an Admin token', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/messaging/threads/${threadId}`)
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(adminMessagingService.viewThreadForDispute).toHaveBeenCalled();
  });

  it('POST /admin/messaging/threads/:threadId/close requires Admin — 401 with no token', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/messaging/threads/${threadId}/close`)
      .send({ reason: 'Reported content' });

    expect(res.status).toBe(401);
  });

  it('POST /admin/messaging/threads/:threadId/close requires Admin — 403 with a Tutor token', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/messaging/threads/${threadId}/close`)
      .set('Authorization', 'Bearer tutor-token')
      .send({ reason: 'Reported content' });

    expect(res.status).toBe(403);
    expect(adminMessagingService.closeThread).not.toHaveBeenCalled();
  });

  it('closeThread passes req.user.id as adminId — succeeds with an Admin token', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/messaging/threads/${threadId}/close`)
      .set('Authorization', 'Bearer admin-token')
      .send({ reason: 'Reported content' });

    expect(res.status).toBe(200);
    expect(adminMessagingService.closeThread).toHaveBeenCalledWith(
      threadId,
      'admin-1',
      'Reported content',
    );
  });
});
