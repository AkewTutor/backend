/**
 * tests/routes/notification.routes.test.ts
 *
 * Journey step 1.16. Spec: `09-1-shared-config.md` §9.13.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/notification.service.js', () => ({
  listForUser: vi.fn(),
  markRead: vi.fn(),
  dispatchNotification: vi.fn(),
  retryFailed: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(() => ({ id: 'user-1', role: 'STUDENT' })),
}));

import * as notificationService from '../../src/services/notification.service.js';
import app from '../../src/app.js';

const authHeader = { Authorization: 'Bearer valid.token.here' };

describe('notification.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (notificationService.listForUser as any).mockResolvedValue({
      notifications: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    (notificationService.markRead as any).mockResolvedValue({
      id: 'n1',
      readAt: new Date().toISOString(),
    });
  });

  it('GET / requires auth — 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/v1/notifications');

    expect(res.status).toBe(401);
  });

  it('PATCH /:id/read requires auth — 401 with no Authorization header', async () => {
    const res = await request(app).patch('/api/v1/notifications/n1/read');

    expect(res.status).toBe(401);
  });

  it('GET / with a valid token reaches the (mocked) service', async () => {
    const res = await request(app).get('/api/v1/notifications').set(authHeader);

    expect(res.status).toBe(200);
    expect(notificationService.listForUser).toHaveBeenCalled();
  });

  it('GET / validates query params — a non-numeric limit is rejected', async () => {
    const res = await request(app).get('/api/v1/notifications?limit=not-a-number').set(authHeader);

    expect(res.status).toBe(400);
  });

  it('PATCH /:id/read with a valid token reaches the (mocked) service', async () => {
    const res = await request(app).patch('/api/v1/notifications/n1/read').set(authHeader);

    expect(res.status).toBe(200);
    expect(notificationService.markRead).toHaveBeenCalled();
  });
});
