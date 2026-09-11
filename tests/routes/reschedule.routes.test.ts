/**
 * tests/routes/reschedule.routes.test.ts
 *
 * Journey step 4.20. Spec: `09-4-class-delivery-library.md` §9.16.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/reschedule.service.js', () => ({
  requestReschedule: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    if (token === 'unrelated-token') return { id: 'unrelated-user', role: 'STUDENT' };
    throw new Error('invalid token');
  }),
}));

import * as rescheduleService from '../../src/services/reschedule.service.js';
import app from '../../src/app.js';
import ApiError from '../../src/utils/ApiError.js';

describe.skip('reschedule.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (rescheduleService.requestReschedule as any).mockResolvedValue({
      id: 'reschedule-1',
      sessionId: 'session-1',
      requestedNewStart: '2026-09-09T16:00:00Z',
      noticeHours: '18.0',
      classification: 'FREE_RESCHEDULE',
      freeReschedulesUsedThisMonth: 1,
    });
  });

  it('route requires auth — 401 with no Authorization header', async () => {
    const res = await request(app)
      .post('/api/v1/reschedule')
      .send({ sessionId: 'session-1', requestedNewStart: '2026-09-09T16:00:00Z' });

    expect(res.status).toBe(401);
  });

  it('validates body shape — a missing requestedNewStart is rejected by validate(requestRescheduleSchema)', async () => {
    const res = await request(app)
      .post('/api/v1/reschedule')
      .set('Authorization', 'Bearer student-token')
      .send({ sessionId: 'session-1' });

    expect(res.status).toBe(400);
    expect(rescheduleService.requestReschedule).not.toHaveBeenCalled();
  });

  it('ownership check happens at the service layer — the controller is a pass-through, a service-level rejection surfaces as some 403', async () => {
    (rescheduleService.requestReschedule as any).mockRejectedValue(
      new ApiError(403, 'Not authorized to reschedule this session'),
    );

    const res = await request(app)
      .post('/api/v1/reschedule')
      .set('Authorization', 'Bearer unrelated-token')
      .send({ sessionId: 'session-1', requestedNewStart: '2026-09-09T16:00:00Z' });

    expect(res.status).toBe(403);
  });

  it('a valid request with a valid token reaches the (mocked) service', async () => {
    const res = await request(app)
      .post('/api/v1/reschedule')
      .set('Authorization', 'Bearer student-token')
      .send({ sessionId: 'session-1', requestedNewStart: '2026-09-09T16:00:00Z' });

    expect(res.status).toBe(200);
    expect(rescheduleService.requestReschedule).toHaveBeenCalled();
  });
});
