/**
 * tests/controllers/adminPeople.controller.test.ts
 *
 * Journey step 2.24. Spec: `09-2-accounts-guardianship.md` §9.19.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/adminPeople.service.js', () => ({
  listUsers: vi.fn(),
  manageRelationshipRecords: vi.fn(),
  suspendAccount: vi.fn(),
  reactivateAccount: vi.fn(),
}));

import * as adminPeopleService from '../../src/services/adminPeople.service.js';
import {
  suspendAccount as suspendAccountController,
  reactivateAccount as reactivateAccountController,
} from '../../src/controllers/adminPeople.controller.js';
function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('adminPeople.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suspendAccount passes (req.params.userId, req.user.id, req.body.reason, req.body.restrictionType)', async () => {
    (adminPeopleService.suspendAccount as any).mockResolvedValue({ id: 'user-1' });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { userId: 'user-1' },
      body: { reason: 'Policy violation', restrictionType: 'SUSPENDED' },
    } as any);

    await suspendAccountController(req, mockRes(), vi.fn());

    expect(adminPeopleService.suspendAccount).toHaveBeenCalledWith(
      'user-1',
      'admin-1',
      'Policy violation',
      'SUSPENDED',
    );
  });

  it('reactivateAccount passes (req.params.userId, req.user.id) and responds 200 with the result', async () => {
    (adminPeopleService.reactivateAccount as any).mockResolvedValue({
      userId: 'user-1',
      status: 'ACTIVE',
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { userId: 'user-1' },
    } as any);
    const res = mockRes();

    await reactivateAccountController(req, res, vi.fn());
    await new Promise((r) => setImmediate(r));

    expect(adminPeopleService.reactivateAccount).toHaveBeenCalledWith('user-1', 'admin-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'user-1', status: 'ACTIVE' } }),
    );
  });
});
