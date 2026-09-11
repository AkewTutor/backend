/**
 * tests/routes/formatSwitch.routes.test.ts
 *
 * Journey step 3.14. Spec: `09-3-matching-cohorts.md` §9.11.
 *
 * Integration (HTTP contract) tier.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/formatSwitch.service.js', () => ({
  requestSwitch: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(() => ({ id: 'user-1', role: 'STUDENT' })),
}));

import * as formatSwitchService from '../../src/services/formatSwitch.service.js';
import app from '../../src/app.js';

const authHeader = { Authorization: 'Bearer valid.jwt.token' };

describe.skip('formatSwitch.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (formatSwitchService.requestSwitch as any).mockResolvedValue({
      formatSwitchRequestId: 'fsr-1',
      fromFormat: 'ONE_TO_ONE',
      toFormat: 'ONE_TO_THREE',
      oldMembershipStatus: 'ENDED',
      newMatchRequestId: 'mr-1',
      refundId: null,
    });
  });

  it('route requires auth — 401 with no Authorization header', async () => {
    const res = await request(app).post('/api/v1/format-switch').send({ toFormat: 'ONE_TO_THREE' });

    expect(res.status).toBe(401);
  });

  it('validates toFormat enum at the route layer', async () => {
    const res = await request(app)
      .post('/api/v1/format-switch')
      .set(authHeader)
      .send({ toFormat: 'BOGUS' });

    expect(res.status).toBe(400);
    expect(formatSwitchService.requestSwitch).not.toHaveBeenCalled();
  });

  it('succeeds with a valid body and token', async () => {
    const res = await request(app)
      .post('/api/v1/format-switch')
      .set(authHeader)
      .send({ toFormat: 'ONE_TO_THREE' });

    expect(res.status).toBe(201);
  });
});
