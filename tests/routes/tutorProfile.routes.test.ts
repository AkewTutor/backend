/**
 * tests/routes/tutorProfile.routes.test.ts
 *
 * Journey step 2.12. Spec: `09-2-accounts-guardianship.md` §9.10.
 * Endpoints: `06-api/02-accounts-guardianship-api.md` §2.2.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/tutorProfile.service.js', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  resubmitVerification: vi.fn(),
  rankSubjects: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    throw new Error('invalid token');
  }),
}));

import * as tutorProfileService from '../../src/services/tutorProfile.service.js';
import app from '../../src/app.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

describe.skip('tutorProfile.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (tutorProfileService.getProfile as any).mockResolvedValue({ id: 'tutor-1' });
    (tutorProfileService.updateProfile as any).mockResolvedValue({ id: 'tutor-1' });
    (tutorProfileService.resubmitVerification as any).mockResolvedValue({
      id: 'tutor-1',
      verificationStatus: 'PENDING',
    });
    (tutorProfileService.rankSubjects as any).mockResolvedValue([]);
  });

  it.each([
    ['get', '/api/v1/tutors/me/profile'],
    ['patch', '/api/v1/tutors/me/profile'],
    ['post', '/api/v1/tutors/me/resubmit-verification'],
    ['put', '/api/v1/tutors/me/subjects'],
  ])('%s %s requires auth — 401 with no Authorization header', async (method, path) => {
    const res = await (request(app) as any)[method](path).send({});

    expect(res.status).toBe(401);
  });

  it('PUT /tutors/me/subjects validates the 2-max/unique-rank rule at the route layer — 3 subjects rejected', async () => {
    const res = await request(app)
      .put('/api/v1/tutors/me/subjects')
      .set('Authorization', 'Bearer tutor-token')
      .send({
        subjects: [
          { subjectId: A, rank: 1 },
          { subjectId: B, rank: 2 },
          { subjectId: C, rank: 1 },
        ],
      });

    expect(res.status).toBe(400);
    expect(tutorProfileService.rankSubjects).not.toHaveBeenCalled();
  });

  it('PUT /tutors/me/subjects succeeds with 2 valid, uniquely-ranked subjects', async () => {
    const res = await request(app)
      .put('/api/v1/tutors/me/subjects')
      .set('Authorization', 'Bearer tutor-token')
      .send({
        subjects: [
          { subjectId: A, rank: 1 },
          { subjectId: B, rank: 2 },
        ],
      });

    expect(res.status).toBe(200);
  });

  it('POST /tutors/me/resubmit-verification succeeds with a Tutor token', async () => {
    const res = await request(app)
      .post('/api/v1/tutors/me/resubmit-verification')
      .set('Authorization', 'Bearer tutor-token')
      .send({});

    expect(res.status).toBe(200);
  });
});
