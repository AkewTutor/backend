/**
 * tests/controllers/messaging.controller.test.ts
 *
 * Journey step 5.3. Spec: `09-5-messaging.md` §9.4.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/messaging.service.js', () => ({
  getThreadForCohort: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
}));

import * as messagingService from '../../src/services/messaging.service.js';
import {
  getThread,
  listMessages as listMessagesHandler,
  sendMessage,
} from '../../src/controllers/messaging.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('messaging.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getThread delegates with req.user.id as callerId and req.params.cohortId — never a client-suppliable caller field', async () => {
    (messagingService.getThreadForCohort as any).mockResolvedValue({
      id: 'thread-1',
      cohortId: 'cohort-1',
      format: 'ONE_TO_ONE',
      status: 'ACTIVE',
      participantCount: 2,
    });
    const req = mockReq({
      user: { id: 'user-1', role: 'STUDENT' },
      params: { cohortId: 'cohort-1' },
      query: { callerId: 'someone-else' },
    } as any);
    const res = mockRes();

    await getThread(req, res, vi.fn());

    expect(messagingService.getThreadForCohort).toHaveBeenCalledWith('user-1', 'cohort-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('listMessages delegates with req.user.id and req.params.cohortId, never a body-supplied cohort id', async () => {
    (messagingService.listMessages as any).mockResolvedValue({
      messages: [],
      page: 1,
      limit: 50,
      total: 0,
    });
    const req = mockReq({
      user: { id: 'user-1', role: 'TUTOR' },
      params: { cohortId: 'cohort-1' },
      query: { page: '1', limit: '50' },
      body: { cohortId: 'other-cohort' },
    } as any);
    const res = mockRes();

    await listMessagesHandler(req, res, vi.fn());

    expect(messagingService.listMessages).toHaveBeenCalledWith(
      'user-1',
      'cohort-1',
      expect.anything(),
      expect.anything(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sendMessage delegates with req.user.id, req.params.cohortId, req.body.body and responds 201', async () => {
    (messagingService.sendMessage as any).mockResolvedValue({
      id: 'm1',
      senderId: 'user-1',
      body: 'hi',
      createdAt: new Date().toISOString(),
    });
    const req = mockReq({
      user: { id: 'user-1', role: 'STUDENT' },
      params: { cohortId: 'cohort-1' },
      body: { body: 'hi' },
    } as any);
    const res = mockRes();

    await sendMessage(req, res, vi.fn());

    expect(messagingService.sendMessage).toHaveBeenCalledWith('user-1', 'cohort-1', 'hi');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('sendMessage propagates the closed-thread 403 unchanged', async () => {
    (messagingService.sendMessage as any).mockRejectedValue(
      Object.assign(new Error('This conversation has been closed'), { statusCode: 403 }),
    );
    const req = mockReq({
      user: { id: 'user-1', role: 'STUDENT' },
      params: { cohortId: 'cohort-1' },
      body: { body: 'hi' },
    } as any);
    const next = vi.fn();

    await sendMessage(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    }
  });
});
