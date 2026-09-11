/**
 * tests/routes/session.routes.test.ts
 *
 * Journey step 4.4. Spec: `09-4-class-delivery-library.md` §9.4.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/session.service.js', () => ({
  listMySessions: vi.fn(),
  getSession: vi.fn(),
  provideJitsiLink: vi.fn(),
  markCompleted: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    throw new Error('invalid token');
  }),
}));

import * as sessionService from '../../src/services/session.service.js';
import app from '../../src/app.js';
import ApiError from '../../src/utils/ApiError.js';

describe.skip('session.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (sessionService.listMySessions as any).mockResolvedValue({
      sessions: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    (sessionService.getSession as any).mockResolvedValue({ id: 'session-1', status: 'SCHEDULED' });
    (sessionService.provideJitsiLink as any).mockResolvedValue({
      id: 'session-1',
      jitsiLinkUrl: 'https://meet.jit.si/abc',
      jitsiLinkSentAt: new Date().toISOString(),
      providedLateNotice: false,
    });
    (sessionService.markCompleted as any).mockResolvedValue({
      id: 'session-1',
      status: 'COMPLETED',
    });
  });

  it('all 4 routes require auth — 401 with no Authorization header', async () => {
    const getAll = await request(app).get('/api/v1/sessions');
    const getOne = await request(app).get('/api/v1/sessions/session-1');
    const link = await request(app)
      .post('/api/v1/sessions/session-1/link')
      .send({ jitsiLinkUrl: 'https://meet.jit.si/abc' });
    const complete = await request(app).post('/api/v1/sessions/session-1/complete');

    expect(getAll.status).toBe(401);
    expect(getOne.status).toBe(401);
    expect(link.status).toBe(401);
    expect(complete.status).toBe(401);
  });

  it('provideLink validates URL shape — rejected by validate(provideJitsiLinkSchema)', async () => {
    const res = await request(app)
      .post('/api/v1/sessions/session-1/link')
      .set('Authorization', 'Bearer tutor-token')
      .send({ jitsiLinkUrl: 'not-a-url' });

    expect(res.status).toBe(400);
    expect(sessionService.provideJitsiLink).not.toHaveBeenCalled();
  });

  it('getSession propagates a 403 unchanged', async () => {
    (sessionService.getSession as any).mockRejectedValue(
      new ApiError(403, 'Not authorized to view this session'),
    );

    const res = await request(app)
      .get('/api/v1/sessions/session-1')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(403);
  });

  it('GET / with a valid token reaches the (mocked) service', async () => {
    const res = await request(app)
      .get('/api/v1/sessions')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(200);
    expect(sessionService.listMySessions).toHaveBeenCalled();
  });

  it('POST /:sessionId/complete with a valid tutor token reaches the (mocked) service', async () => {
    const res = await request(app)
      .post('/api/v1/sessions/session-1/complete')
      .set('Authorization', 'Bearer tutor-token');

    expect(res.status).toBe(200);
    expect(sessionService.markCompleted).toHaveBeenCalledWith('tutor-1', 'session-1');
  });
});
