/**
 * tests/controllers/guardianship.controller.test.ts
 *
 * Journey step 2.7. Spec: `09-2-accounts-guardianship.md` §9.7.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/guardianship.service.js', () => ({
  addStudentAndInvite: vi.fn(),
  resendOrRegenerateInvite: vi.fn(),
  activateInvite: vi.fn(),
  inviteOptionalGuardian: vi.fn(),
  revokeOrModifyRelationship: vi.fn(),
}));

import * as guardianshipService from '../../src/services/guardianship.service.js';
import { revokeRelationship } from '../../src/controllers/guardianship.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('guardianship.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revokeRelationship passes req.user through, never trusting a client-supplied caller id — params.id is the relationship id', async () => {
    (guardianshipService.revokeOrModifyRelationship as any).mockResolvedValue({
      id: 'rel-1',
      status: 'REVOKED',
    });
    const req = mockReq({
      user: { id: 'parent-1', role: 'PARENT' },
      params: { id: 'rel-1' },
      body: { revoke: true },
    } as any);

    await revokeRelationship(req, mockRes(), vi.fn());

    expect(guardianshipService.revokeOrModifyRelationship).toHaveBeenCalledWith(
      'parent-1',
      'PARENT',
      'rel-1',
      { revoke: true },
    );
  });
});
