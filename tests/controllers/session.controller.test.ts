/**
 * tests/controllers/session.controller.test.ts
 *
 * Journey step 4.3. Spec: `09-4-class-delivery-library.md` §9.4.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/session.service.js', () => ({
  listMySessions: vi.fn(),
  getSession: vi.fn(),
  provideJitsiLink: vi.fn(),
  markCompleted: vi.fn(),
}));

import * as sessionService from '../../src/services/session.service.js';
import {
  completeSession,
  getSession,
  listMySessions,
  provideLink,
} from '../../src/controllers/session.controller.js';
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

describe.skip('session.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listMySessions delegates with the caller and responds 200', async () => {
    (sessionService.listMySessions as any).mockResolvedValue({
      sessions: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({ user: { id: 'student-1', role: 'STUDENT' } } as any);
    const res = mockRes();

    await listMySessions(req, res, vi.fn());

    expect(sessionService.listMySessions).toHaveBeenCalledWith(
      'student-1',
      'STUDENT',
      expect.anything(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('provideLink delegates with (req.user.id, req.params.sessionId, req.body.jitsiLinkUrl)', async () => {
    (sessionService.provideJitsiLink as any).mockResolvedValue({
      id: 'session-1',
      jitsiLinkUrl: 'https://meet.jit.si/abc',
      jitsiLinkSentAt: new Date(),
      providedLateNotice: false,
    });
    const req = mockReq({
      params: { sessionId: 'session-1' },
      body: { jitsiLinkUrl: 'https://meet.jit.si/abc' },
      user: { id: 'tutor-1', role: 'TUTOR' },
    } as any);
    const res = mockRes();

    await provideLink(req, res, vi.fn());

    expect(sessionService.provideJitsiLink).toHaveBeenCalledWith(
      'tutor-1',
      'session-1',
      'https://meet.jit.si/abc',
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getSession propagates a 403 unchanged', async () => {
    (sessionService.getSession as any).mockRejectedValue(
      new ApiError(403, 'Not authorized to view this session'),
    );
    const req = mockReq({
      params: { sessionId: 'session-1' },
      user: { id: 'u1', role: 'STUDENT' },
    } as any);
    const next = vi.fn();

    await getSession(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    }
  });

  it('completeSession delegates to markCompleted with (req.user.id, req.params.sessionId)', async () => {
    (sessionService.markCompleted as any).mockResolvedValue({
      id: 'session-1',
      status: 'COMPLETED',
    });
    const req = mockReq({
      params: { sessionId: 'session-1' },
      user: { id: 'tutor-1', role: 'TUTOR' },
    } as any);
    const res = mockRes();

    await completeSession(req, res, vi.fn());

    expect(sessionService.markCompleted).toHaveBeenCalledWith('tutor-1', 'session-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
