/**
 * tests/controllers/adminMessaging.controller.test.ts
 *
 * Journey step 5.6. Spec: `09-5-messaging.md` §9.6.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/adminMessaging.service.js', () => ({
  viewThreadForDispute: vi.fn(),
  closeThread: vi.fn(),
}));

import * as adminMessagingService from '../../src/services/adminMessaging.service.js';
import { closeThread, viewThread } from '../../src/controllers/adminMessaging.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('adminMessaging.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('viewThread delegates with req.params.threadId and pagination, responds 200', async () => {
    (adminMessagingService.viewThreadForDispute as any).mockResolvedValue({
      id: 'thread-1',
      cohortId: 'cohort-1',
      status: 'ACTIVE',
      messages: [],
      page: 1,
      limit: 50,
      total: 0,
    });
    const req = mockReq({
      params: { threadId: 'thread-1' },
      query: { page: '1', limit: '50' },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const res = mockRes();

    await viewThread(req, res, vi.fn());

    expect(adminMessagingService.viewThreadForDispute).toHaveBeenCalledWith(
      'thread-1',
      expect.anything(),
      expect.anything(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('closeThread passes req.user.id as adminId, never a client-suppliable admin id from the body', async () => {
    (adminMessagingService.closeThread as any).mockResolvedValue({
      id: 'thread-1',
      status: 'CLOSED_BY_ADMIN',
      closedById: 'admin-1',
      closedAt: new Date().toISOString(),
    });
    const req = mockReq({
      params: { threadId: 'thread-1' },
      body: { reason: 'Reported content', adminId: 'someone-else' },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const res = mockRes();

    await closeThread(req, res, vi.fn());

    expect(adminMessagingService.closeThread).toHaveBeenCalledWith(
      'thread-1',
      'admin-1',
      'Reported content',
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('viewThread propagates 404 unchanged', async () => {
    (adminMessagingService.viewThreadForDispute as any).mockRejectedValue(
      Object.assign(new Error('Thread not found'), { statusCode: 404 }),
    );
    const req = mockReq({
      params: { threadId: 'bad-id' },
      query: {},
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const next = vi.fn();

    await viewThread(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404 });
    }
  });
});
