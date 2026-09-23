/**
 * tests/controllers/adminTutorVerification.controller.test.ts
 *
 * Journey step 2.21. Spec: `09-2-accounts-guardianship.md` §9.17.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/adminTutorVerification.service.js', () => ({
  listPendingTutors: vi.fn(),
  approveTutor: vi.fn(),
  rejectTutor: vi.fn(),
}));

import * as adminTutorVerificationService from '../../src/services/adminTutorVerification.service.js';
import { approve, reject } from '../../src/controllers/adminTutorVerification.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('adminTutorVerification.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approve passes req.user.id as adminId, never client-suppliable', async () => {
    (adminTutorVerificationService.approveTutor as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'VERIFIED',
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { tutorId: 't1' },
    } as any);

    await approve(req, mockRes(), vi.fn());

    expect(adminTutorVerificationService.approveTutor).toHaveBeenCalledWith('t1', 'admin-1');
  });

  it('reject passes req.user.id as adminId and forwards the reason from the body', async () => {
    (adminTutorVerificationService.rejectTutor as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'REJECTED',
    });
    const req = mockReq({
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { tutorId: 't1' },
      body: { reason: 'Incomplete credentials' },
    } as any);

    await reject(req, mockRes(), vi.fn());

    expect(adminTutorVerificationService.rejectTutor).toHaveBeenCalledWith(
      't1',
      'admin-1',
      'Incomplete credentials',
    );
  });
});
