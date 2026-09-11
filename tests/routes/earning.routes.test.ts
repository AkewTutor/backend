/**
 * tests/routes/earning.routes.test.ts
 *
 * Phase 7, step 7.19. Spec: `09-7-payments-earnings.md` §9.15 (routes half).
 *
 * Integration (HTTP contract) tier — drives the real Express app via
 * supertest, mounted at `/tutors/me/earnings`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/earning.service.js', () => ({
  creditEarning: vi.fn(),
  getEarningsForTutor: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    throw new Error('invalid token');
  }),
}));

import * as earningService from '../../src/services/earning.service.js';
import app from '../../src/app.js';

describe.skip('earning.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (earningService.getEarningsForTutor as any).mockResolvedValue({
      earnings: [],
      upcomingPayout: { amount: '0.00' },
      page: 1,
      limit: 20,
      total: 0,
    });
  });

  it('GET /tutors/me/earnings requires auth — 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/v1/tutors/me/earnings');

    expect(res.status).toBe(401);
    expect(earningService.getEarningsForTutor).not.toHaveBeenCalled();
  });

  it('GET /tutors/me/earnings succeeds with a Tutor token and is always scoped to the caller', async () => {
    const res = await request(app)
      .get('/api/v1/tutors/me/earnings')
      .set('Authorization', 'Bearer tutor-token');

    expect(res.status).toBe(200);
    expect(earningService.getEarningsForTutor).toHaveBeenCalledWith(
      'tutor-1',
      expect.anything(),
      expect.anything(),
    );
  });
});
