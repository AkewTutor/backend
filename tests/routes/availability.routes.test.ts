/**
 * tests/routes/availability.routes.test.ts
 *
 * Journey step 2.16. Spec: `09-2-accounts-guardianship.md` §9.13.
 * Endpoints: `06-api/02-accounts-guardianship-api.md` §2.2.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/availability.service.js', () => ({
  listSlots: vi.fn(),
  setSlots: vi.fn(),
  removeSlot: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    throw new Error('invalid token');
  }),
}));

import * as availabilityService from '../../src/services/availability.service.js';
import app from '../../src/app.js';

describe.skip('availability.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (availabilityService.listSlots as any).mockResolvedValue([]);
    (availabilityService.setSlots as any).mockResolvedValue({ id: 'slot-1' });
    (availabilityService.removeSlot as any).mockResolvedValue({ id: 'slot-1', deleted: true });
  });

  it.each([
    ['get', '/api/v1/tutors/me/availability'],
    ['post', '/api/v1/tutors/me/availability'],
    ['delete', '/api/v1/tutors/me/availability/11111111-1111-4111-8111-111111111111'],
  ])('%s %s requires auth — 401', async (method, path) => {
    const res = await (request(app) as any)[method](path).send({});

    expect(res.status).toBe(401);
  });

  it('addSlot validates body — endTime before startTime is rejected by validate(createSlotSchema)', async () => {
    const res = await request(app)
      .post('/api/v1/tutors/me/availability')
      .set('Authorization', 'Bearer tutor-token')
      .send({
        isRecurring: false,
        startTime: '2026-06-01T11:00:00Z',
        endTime: '2026-06-01T10:00:00Z',
      });

    expect(res.status).toBe(400);
    expect(availabilityService.setSlots).not.toHaveBeenCalled();
  });

  it('POST /tutors/me/availability succeeds with a valid body', async () => {
    const res = await request(app)
      .post('/api/v1/tutors/me/availability')
      .set('Authorization', 'Bearer tutor-token')
      .send({
        isRecurring: false,
        startTime: '2026-06-01T10:00:00Z',
        endTime: '2026-06-01T11:00:00Z',
      });

    expect(res.status).toBe(201);
  });
});
