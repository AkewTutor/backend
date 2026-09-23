/**
 * tests/routes/adminMatching.routes.test.ts
 *
 * Journey step 3.10. Spec: `09-3-matching-cohorts.md` §9.8.
 * OWASP: A01:2021 – Broken Access Control.
 *
 * Integration (HTTP contract) tier.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/adminMatching.service.js', () => ({
  listPendingApprovals: vi.fn(),
  approveBooking: vi.fn(),
  rejectBooking: vi.fn(),
  manuallyAssignTutor: vi.fn(),
  manuallyAssembleGroup: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin.jwt.token') return { id: 'admin-1', role: 'ADMIN' };
    return { id: 'tutor-1', role: 'TUTOR' };
  }),
}));

import * as adminMatchingService from '../../src/services/adminMatching.service.js';
import app from '../../src/app.js';

const cohortId = randomUUID();
const tutorId = randomUUID();
const adminAuth = { Authorization: 'Bearer admin.jwt.token' };
const tutorAuth = { Authorization: 'Bearer tutor.jwt.token' };

describe('adminMatching.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (adminMatchingService.listPendingApprovals as any).mockResolvedValue({
      queue: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    (adminMatchingService.approveBooking as any).mockResolvedValue({
      cohortId,
      status: 'PENDING_PAYMENT',
    });
    (adminMatchingService.rejectBooking as any).mockResolvedValue({
      cohortId,
      status: 'CANCELLED',
    });
    (adminMatchingService.manuallyAssignTutor as any).mockResolvedValue({
      cohortId,
      status: 'PENDING_PAYMENT',
    });
  });

  const routes: Array<[string, string, Record<string, unknown>?]> = [
    ['get', '/api/v1/admin/matching/queue'],
    ['post', `/api/v1/admin/matching/${cohortId}/approve`],
    ['post', `/api/v1/admin/matching/${cohortId}/reject`, { internalReason: 'r' }],
    ['post', '/api/v1/admin/matching/manual-assign', { matchRequestIds: [randomUUID()], tutorId }],
  ];

  it.each(routes)(
    '%s %s requires Admin — 401 with no Authorization header',
    async (method, path, body) => {
      const req = (request(app) as any)[method](path);
      const res = body ? await req.send(body) : await req;

      expect(res.status).toBe(401);
    },
  );

  it.each(routes)('%s %s requires Admin — 403 for a Tutor token', async (method, path, body) => {
    const req = (request(app) as any)[method](path).set(tutorAuth);
    const res = body ? await req.send(body) : await req;

    expect(res.status).toBe(403);
  });

  it('all 4 routes succeed for an Admin token', async () => {
    for (const [method, path, body] of routes) {
      const req = (request(app) as any)[method](path).set(adminAuth);
      const res = body ? await req.send(body) : await req;
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    }
  });
});
