/**
 * tests/routes/challenge.routes.test.ts
 *
 * Journey step 6.13. Spec: `09-6-gamification-engagement.md` §9.9.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/challenge.service.js', () => ({
  listActiveChallenges: vi.fn(),
  createChallenge: vi.fn(),
  getMyProgress: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    throw new Error('invalid token');
  }),
}));

import * as challengeService from '../../src/services/challenge.service.js';
import app from '../../src/app.js';

const VALID_BODY = {
  title: 'Complete 3 assessments this week',
  description: '...',
  period: 'WEEKLY',
  startsAt: '2026-09-01T00:00:00Z',
  endsAt: '2026-09-07T23:59:59Z',
  targetValue: 3,
};

describe.skip('challenge.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (challengeService.listActiveChallenges as any).mockResolvedValue([]);
    (challengeService.getMyProgress as any).mockResolvedValue({ progress: [] });
    (challengeService.createChallenge as any).mockResolvedValue({
      id: 'challenge-1',
      title: VALID_BODY.title,
      period: VALID_BODY.period,
    });
  });

  it('GET /gamification/challenges succeeds with a Student token', async () => {
    const res = await request(app)
      .get('/api/v1/gamification/challenges')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(200);
  });

  it('GET /gamification/challenges/me succeeds with a Student token', async () => {
    const res = await request(app)
      .get('/api/v1/gamification/challenges/me')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(200);
  });

  it('adminCreate requires Admin — 401 with no token, then 403 with a Tutor token', async () => {
    const noToken = await request(app).post('/api/v1/admin/challenges').send(VALID_BODY);
    const tutorToken = await request(app)
      .post('/api/v1/admin/challenges')
      .set('Authorization', 'Bearer tutor-token')
      .send(VALID_BODY);

    expect(noToken.status).toBe(401);
    expect(tutorToken.status).toBe(403);
  });

  it('adminCreate validates body — endsAt before startsAt is rejected before the controller runs', async () => {
    const res = await request(app)
      .post('/api/v1/admin/challenges')
      .set('Authorization', 'Bearer admin-token')
      .send({ ...VALID_BODY, startsAt: '2026-09-10T00:00:00Z', endsAt: '2026-09-01T00:00:00Z' });

    expect(res.status).toBe(400);
    expect(challengeService.createChallenge).not.toHaveBeenCalled();
  });

  it('adminCreate succeeds with a valid Admin-submitted body', async () => {
    const res = await request(app)
      .post('/api/v1/admin/challenges')
      .set('Authorization', 'Bearer admin-token')
      .send(VALID_BODY);

    expect(res.status).toBe(201);
  });
});
