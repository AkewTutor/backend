/**
 * tests/routes/cohort.routes.test.ts
 *
 * Journey step 3.7. Spec: `09-3-matching-cohorts.md` §9.6.
 *
 * Integration (HTTP contract) tier.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/cohort.service.js', () => ({
  getMyCohort: vi.fn(),
  getCohortMembers: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(() => ({ id: 'user-1', role: 'STUDENT' })),
}));

import * as cohortService from '../../src/services/cohort.service.js';
import app from '../../src/app.js';

const cohortId = randomUUID();
const authHeader = { Authorization: 'Bearer valid.jwt.token' };

describe.skip('cohort.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cohortService.getMyCohort as any).mockResolvedValue({ cohorts: [] });
    (cohortService.getCohortMembers as any).mockResolvedValue({ cohortId, tutor: {} });
  });

  it('both routes require auth — 401 with no Authorization header', async () => {
    const meRes = await request(app).get('/api/v1/cohorts/me');
    const membersRes = await request(app).get(`/api/v1/cohorts/${cohortId}/members`);

    expect(meRes.status).toBe(401);
    expect(membersRes.status).toBe(401);
  });

  it('GET /cohorts/me succeeds with a valid token', async () => {
    const res = await request(app).get('/api/v1/cohorts/me').set(authHeader);

    expect(res.status).toBe(200);
  });

  it('GET /cohorts/:cohortId/members succeeds with a valid token', async () => {
    const res = await request(app).get(`/api/v1/cohorts/${cohortId}/members`).set(authHeader);

    expect(res.status).toBe(200);
  });
});
