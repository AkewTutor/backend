/**
 * tests/routes/sessionMiss.routes.test.ts
 *
 * Journey step 4.23. Spec: `09-4-class-delivery-library.md` §9.18.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/sessionMiss.service.js', () => ({
  listMisses: vi.fn(),
  recordTutorCausedMiss: vi.fn(),
  recordStudentCausedMiss: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    throw new Error('invalid token');
  }),
}));

import * as sessionMissService from '../../src/services/sessionMiss.service.js';
import app from '../../src/app.js';

describe.skip('sessionMiss.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (sessionMissService.listMisses as any).mockResolvedValue({
      misses: [],
      escalationFlag: false,
      page: 1,
      limit: 20,
      total: 0,
    });
    (sessionMissService.recordTutorCausedMiss as any).mockResolvedValue({
      id: 'miss-1',
      sessionId: 'session-1',
      causedBy: 'TUTOR',
      missType: 'NO_SHOW',
      makeupSessionId: 'makeup-1',
    });
  });

  it('POST / requires Admin — 401 with no Authorization header, then 403 with a Tutor token', async () => {
    const unauthenticated = await request(app)
      .post('/api/v1/session-miss')
      .send({ sessionId: 'session-1', causedBy: 'TUTOR', missType: 'NO_SHOW' });
    const wrongRole = await request(app)
      .post('/api/v1/session-miss')
      .set('Authorization', 'Bearer tutor-token')
      .send({ sessionId: 'session-1', causedBy: 'TUTOR', missType: 'NO_SHOW' });

    expect(unauthenticated.status).toBe(401);
    expect(wrongRole.status).toBe(403);
  });

  it('GET / with a valid Admin token reaches the (mocked) service', async () => {
    const res = await request(app)
      .get('/api/v1/session-miss')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(sessionMissService.listMisses).toHaveBeenCalled();
  });

  it('GET / with a valid Tutor token reaches the (mocked) service, scoped to the caller', async () => {
    const res = await request(app)
      .get('/api/v1/session-miss')
      .set('Authorization', 'Bearer tutor-token');

    expect(res.status).toBe(200);
    expect(sessionMissService.listMisses).toHaveBeenCalledWith(
      expect.objectContaining({ tutorId: 'tutor-1' }),
    );
  });

  it('POST / with a valid Admin token reaches the (mocked) service', async () => {
    const res = await request(app)
      .post('/api/v1/session-miss')
      .set('Authorization', 'Bearer admin-token')
      .send({ sessionId: 'session-1', causedBy: 'TUTOR', missType: 'NO_SHOW' });

    expect(res.status).toBe(201);
    expect(sessionMissService.recordTutorCausedMiss).toHaveBeenCalled();
  });
});
