/**
 * tests/routes/matching.routes.test.ts
 *
 * Journey step 3.4. Spec: `09-3-matching-cohorts.md` §9.4.
 * OWASP: A01:2021 – Broken Access Control.
 *
 * Integration (HTTP contract) tier — drives the real Express app via
 * supertest, with `matching.service.ts` mocked. Proves routing →
 * middleware → controller wiring, not persistence.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/matching.service.js', () => ({
  searchOneToOneTutors: vi.fn(),
  recommendTutorsWithMatchPercent: vi.fn(),
  getTutorDetail: vi.fn(),
  selectTutor: vi.fn(),
  triggerNoExactMatch: vi.fn(),
  requestGroupFormat: vi.fn(),
  getMyRequestStatus: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(() => ({ id: 'user-1', role: 'STUDENT' })),
}));

import * as matchingService from '../../src/services/matching.service.js';
import app from '../../src/app.js';

const tutorId = randomUUID();
const subjectId = randomUUID();
const authHeader = { Authorization: 'Bearer valid.jwt.token' };

const endpoints: Array<[string, string, Record<string, unknown>?]> = [
  ['get', `/api/v1/matching/tutors/search?subjectId=${subjectId}&grade=9`],
  ['get', '/api/v1/matching/tutors/recommendations'],
  ['get', `/api/v1/matching/tutors/${tutorId}`],
  ['post', '/api/v1/matching/select-tutor', { tutorId }],
  ['post', '/api/v1/matching/no-exact-match', {}],
  ['post', '/api/v1/matching/group-format', { subjectId }],
  ['get', '/api/v1/matching/requests/me'],
];

describe('matching.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (matchingService.searchOneToOneTutors as any).mockResolvedValue({ tutors: [] });
    (matchingService.recommendTutorsWithMatchPercent as any).mockResolvedValue({
      recommendations: [],
      matchRequestId: 'mr-1',
      zeroMatchSince: null,
    });
    (matchingService.getTutorDetail as any).mockResolvedValue({ tutorId });
    (matchingService.selectTutor as any).mockResolvedValue({
      cohortId: 'c1',
      status: 'PENDING_ADMIN_APPROVAL',
      tutorId,
    });
    (matchingService.triggerNoExactMatch as any).mockResolvedValue({
      matchRequestId: 'mr-1',
      status: 'PENDING_ADMIN_ASSIGNMENT',
    });
    (matchingService.requestGroupFormat as any).mockResolvedValue({
      matchRequestId: 'mr-1',
      status: 'SEARCHING',
    });
    (matchingService.getMyRequestStatus as any).mockResolvedValue({
      id: 'mr-1',
      status: 'SEARCHING',
    });
  });

  it.each(endpoints)(
    '%s %s requires auth — 401 with no Authorization header',
    async (method, path, body) => {
      const req = (request(app) as any)[method](path);
      const res = body ? await req.send(body) : await req;

      expect(res.status).toBe(401);
    },
  );

  it('all 7 routes succeed with a valid token', async () => {
    for (const [method, path, body] of endpoints) {
      const req = (request(app) as any)[method](path).set(authHeader);
      const res = body ? await req.send(body) : await req;
      expect(res.status).not.toBe(401);
    }
  });

  it('searchTutors validates required query params via validate(searchTutorsQuerySchema)', async () => {
    const res = await request(app).get('/api/v1/matching/tutors/search').set(authHeader);

    expect(res.status).toBe(400);
    expect(matchingService.searchOneToOneTutors).not.toHaveBeenCalled();
  });

  it('selectTutor validates tutorId via validate(selectTutorSchema)', async () => {
    const res = await request(app).post('/api/v1/matching/select-tutor').set(authHeader).send({});

    expect(res.status).toBe(400);
    expect(matchingService.selectTutor).not.toHaveBeenCalled();
  });
});
