/**
 * tests/routes/paymentPause.routes.test.ts
 *
 * Phase 7, step 7.8. Spec: `09-7-payments-earnings.md` §9.7 (routes half).
 *
 * Integration (HTTP contract) tier — drives the real Express app via
 * supertest. `getPauseStatus` reads Prisma directly (see the controller
 * test's interface note), so Prisma is mocked here rather than a service.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    paymentPause: {
      findFirst: vi.fn(),
    },
    scheduledSession: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    throw new Error('invalid token');
  }),
}));

import { prisma } from '../../src/config/db.js';
import app from '../../src/app.js';

describe.skip('paymentPause.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.paymentPause.findFirst as any).mockResolvedValue(null);
    (prisma.scheduledSession.findMany as any).mockResolvedValue([]);
  });

  it('GET /payment-pause/status requires auth — 401 with no Authorization header', async () => {
    const res = await request(app).get(
      '/api/v1/payment-pause/status?cohortMembershipId=membership-1',
    );

    expect(res.status).toBe(401);
    expect(prisma.paymentPause.findFirst).not.toHaveBeenCalled();
  });

  it('GET /payment-pause/status succeeds with a valid Student token', async () => {
    const res = await request(app)
      .get('/api/v1/payment-pause/status?cohortMembershipId=membership-1')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ isPaused: false });
  });
});
