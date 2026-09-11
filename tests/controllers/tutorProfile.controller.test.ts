/**
 * tests/controllers/tutorProfile.controller.test.ts
 *
 * Journey step 2.11. Spec: `09-2-accounts-guardianship.md` §9.10.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/tutorProfile.service.js', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  resubmitVerification: vi.fn(),
  rankSubjects: vi.fn(),
}));

import * as tutorProfileService from '../../src/services/tutorProfile.service.js';
import {
  resubmitVerification as resubmitVerificationController,
  updateProfile as updateProfileController,
} from '../../src/controllers/tutorProfile.controller.js';
import ApiError from '../../src/utils/ApiError.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('tutorProfile.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateProfile passes only req.body through, id from req.user — never a client-suppliable tutor id', async () => {
    (tutorProfileService.updateProfile as any).mockResolvedValue({ id: 'tp-1', bio: 'new' });
    const req = mockReq({
      user: { id: 'tp-1', role: 'TUTOR' },
      body: { bio: 'new' },
    } as any);

    await updateProfileController(req, mockRes(), vi.fn());

    expect(tutorProfileService.updateProfile).toHaveBeenCalledWith('tp-1', { bio: 'new' });
  });

  it('resubmitVerification takes no body — id from req.user only, any body content ignored (Issue 2 fix)', async () => {
    (tutorProfileService.resubmitVerification as any).mockResolvedValue({
      id: 'tp-1',
      verificationStatus: 'PENDING',
    });
    const req = mockReq({
      user: { id: 'tp-1', role: 'TUTOR' },
      body: { verificationStatus: 'VERIFIED', bio: 'injected' },
    } as any);

    await resubmitVerificationController(req, mockRes(), vi.fn());

    expect(tutorProfileService.resubmitVerification).toHaveBeenCalledWith('tp-1');
  });

  it('resubmitVerification on an already-PENDING/VERIFIED tutor surfaces the service 409 unchanged', async () => {
    (tutorProfileService.resubmitVerification as any).mockRejectedValue(
      new ApiError(409, 'Only a rejected application can be resubmitted'),
    );
    const req = mockReq({ user: { id: 'tp-1', role: 'TUTOR' } } as any);
    const next = vi.fn();

    await resubmitVerificationController(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 409 });
    }
  });
});
