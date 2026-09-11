/**
 * tests/routes/adminPeople.routes.test.ts
 *
 * Journey step 2.25. Spec: `09-2-accounts-guardianship.md` §9.19.
 * Endpoints: `06-api/02-accounts-guardianship-api.md` §2.2.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/adminPeople.service.js', () => ({
  listUsers: vi.fn(),
  manageRelationshipRecords: vi.fn(),
  suspendAccount: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'parent-token') return { id: 'parent-1', role: 'PARENT' };
    throw new Error('invalid token');
  }),
}));

import * as adminPeopleService from '../../src/services/adminPeople.service.js';
import app from '../../src/app.js';

describe.skip('adminPeople.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (adminPeopleService.listUsers as any).mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    (adminPeopleService.manageRelationshipRecords as any).mockResolvedValue({ id: 'rel-1' });
    (adminPeopleService.suspendAccount as any).mockResolvedValue({ id: 'user-1' });
  });

  it.each([
    ['get', '/api/v1/admin/people'],
    ['patch', '/api/v1/admin/people/relationships/rel-1'],
    ['post', '/api/v1/admin/people/user-1/suspend'],
  ])('%s %s requires Admin — 401 with no header', async (method, path) => {
    const res = await (request(app) as any)[method](path).send({});

    expect(res.status).toBe(401);
  });

  it.each([
    ['get', '/api/v1/admin/people'],
    ['patch', '/api/v1/admin/people/relationships/rel-1'],
    ['post', '/api/v1/admin/people/user-1/suspend'],
  ])('%s %s requires Admin — 403 with a Parent token', async (method, path) => {
    const res = await (request(app) as any)
      [method](path)
      .set('Authorization', 'Bearer parent-token')
      .send({});

    expect(res.status).toBe(403);
  });

  it('POST /admin/people/:userId/suspend succeeds with an Admin token', async () => {
    const res = await request(app)
      .post('/api/v1/admin/people/user-1/suspend')
      .set('Authorization', 'Bearer admin-token')
      .send({ reason: 'Policy violation', restrictionType: 'SUSPENDED' });

    expect(res.status).toBe(200);
  });
});
