/**
 * tests/routes/guardianship.routes.test.ts
 *
 * Journey step 2.8. Spec: `09-2-accounts-guardianship.md` §9.7.
 * Endpoints: `06-api/02-accounts-guardianship-api.md` §2.2.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/guardianship.service.js', () => ({
  addStudentAndInvite: vi.fn(),
  resendOrRegenerateInvite: vi.fn(),
  activateInvite: vi.fn(),
  inviteOptionalGuardian: vi.fn(),
  revokeOrModifyRelationship: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'parent-token') return { id: 'parent-1', role: 'PARENT' };
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    throw new Error('invalid token');
  }),
}));

import * as guardianshipService from '../../src/services/guardianship.service.js';
import app from '../../src/app.js';

describe.skip('guardianship.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (guardianshipService.addStudentAndInvite as any).mockResolvedValue({
      studentProfileId: 'sp-1',
      relationshipId: 'rel-1',
    });
    (guardianshipService.resendOrRegenerateInvite as any).mockResolvedValue({ id: 'rel-1' });
    (guardianshipService.activateInvite as any).mockResolvedValue({
      accessToken: 't',
      studentId: 'sp-1',
      relationshipStatus: 'ACTIVE',
    });
    (guardianshipService.inviteOptionalGuardian as any).mockResolvedValue({ id: 'rel-2' });
    (guardianshipService.revokeOrModifyRelationship as any).mockResolvedValue({ id: 'rel-1' });
  });

  it.each([
    ['post', '/api/v1/guardianship/students'],
    ['post', '/api/v1/guardianship/invites/rel-1/resend'],
    ['post', '/api/v1/guardianship/guardian-invites'],
    ['patch', '/api/v1/guardianship/relationships/rel-1/revoke'],
  ])('%s %s requires auth — 401 with no Authorization header', async (method, path) => {
    const res = await (request(app) as any)[method](path).send({});

    expect(res.status).toBe(401);
  });

  it('activateInvite is deliberately public — the token is the credential, no auth header required', async () => {
    const res = await request(app)
      .post('/api/v1/guardianship/invites/some-token/activate')
      .send({ password: 'password123' });

    expect(res.status).not.toBe(401);
  });

  it('activateInvite validates password shape — a too-short password is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/guardianship/invites/some-token/activate')
      .send({ password: 'short' });

    expect(res.status).toBe(400);
    expect(guardianshipService.activateInvite).not.toHaveBeenCalled();
  });

  it('POST /guardianship/students succeeds with a Parent token', async () => {
    const res = await request(app)
      .post('/api/v1/guardianship/students')
      .set('Authorization', 'Bearer parent-token')
      .send({ grade: 3, inviteContact: 'a@b.com' });

    expect(res.status).toBe(201);
  });

  it('PATCH /guardianship/relationships/:id/revoke passes req.user through, never trusts a client-supplied caller id', async () => {
    await request(app)
      .patch('/api/v1/guardianship/relationships/rel-1/revoke')
      .set('Authorization', 'Bearer parent-token')
      .send({ revoke: true });

    expect(guardianshipService.revokeOrModifyRelationship).toHaveBeenCalledWith(
      'parent-1',
      'PARENT',
      'rel-1',
      expect.objectContaining({ revoke: true }),
    );
  });
});
