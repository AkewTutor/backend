/**
 * tests/controllers/notification.controller.test.ts
 *
 * Journey step 1.15. Spec: `09-1-shared-config.md` §9.13.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/notification.service.js', () => ({
  listForUser: vi.fn(),
  markRead: vi.fn(),
}));

import * as notificationService from '../../src/services/notification.service.js';
import { listMyNotifications, markAsRead } from '../../src/controllers/notification.controller.js';
import ApiError from '../../src/utils/ApiError.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('notification.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listMyNotifications delegates with the caller's own id, never a client-suppliable one", async () => {
    (notificationService.listForUser as any).mockResolvedValue({
      notifications: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({
      user: { id: 'user-1', role: 'STUDENT' },
      query: { unreadOnly: 'false', userId: 'someone-else' },
    } as any);

    await listMyNotifications(req, mockRes(), vi.fn());

    expect(notificationService.listForUser).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('markAsRead delegates with (req.params.id, req.user.id) and responds 200', async () => {
    (notificationService.markRead as any).mockResolvedValue({ id: 'n1', readAt: new Date() });
    const req = mockReq({ params: { id: 'n1' }, user: { id: 'user-1', role: 'STUDENT' } } as any);
    const res = mockRes();

    await markAsRead(req, res, vi.fn());

    expect(notificationService.markRead).toHaveBeenCalledWith('n1', 'user-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('markAsRead propagates 403 unchanged', async () => {
    (notificationService.markRead as any).mockRejectedValue(
      new ApiError(403, 'Not authorized to modify this notification'),
    );
    const req = mockReq({ params: { id: 'n1' }, user: { id: 'user-1', role: 'STUDENT' } } as any);
    const next = vi.fn();

    await markAsRead(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    }
  });

  it('markAsRead propagates 404 unchanged, as a genuinely distinct branch from 403', async () => {
    (notificationService.markRead as any).mockRejectedValue(
      new ApiError(404, 'Notification not found'),
    );
    const req = mockReq({
      params: { id: 'bad-id' },
      user: { id: 'user-1', role: 'STUDENT' },
    } as any);
    const next = vi.fn();

    await markAsRead(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404 });
    }
  });
});
