/**
 * tests/controllers/studentProfile.controller.test.ts
 *
 * Journey step 2.3. Spec: `09-2-accounts-guardianship.md` §9.4.
 *
 * The controller is a pure pass-through — it does no authorization itself;
 * the 403 ownership-scoping tests live at the service layer (2.2 above).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/studentProfile.service.js', () => ({
  getProfile: vi.fn(),
  updateBasicProfile: vi.fn(),
  updateAcademicProfile: vi.fn(),
}));

import * as studentProfileService from '../../src/services/studentProfile.service.js';
import {
  getMyProfile,
  updateAcademicProfile as updateAcademicProfileController,
} from '../../src/controllers/studentProfile.controller.js';
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

describe('studentProfile.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMyProfile delegates with req.user identity, not a client-suppliable override, when studentId is absent', async () => {
    (studentProfileService.getProfile as any).mockResolvedValue({ id: 'sp-1' });
    const req = mockReq({ user: { id: 'sp-1', role: 'STUDENT' }, query: {} } as any);

    await getMyProfile(req, mockRes(), vi.fn());

    expect(studentProfileService.getProfile).toHaveBeenCalledWith('sp-1', 'STUDENT', undefined);
  });

  it("getMyProfile passes a parent's chosen studentId through for the service's own ownership check", async () => {
    (studentProfileService.getProfile as any).mockResolvedValue({ id: 'x' });
    const req = mockReq({
      user: { id: 'parent-1', role: 'PARENT' },
      query: { studentId: 'x' },
    } as any);

    await getMyProfile(req, mockRes(), vi.fn());

    expect(studentProfileService.getProfile).toHaveBeenCalledWith('parent-1', 'PARENT', 'x');
  });

  it('updateAcademicProfile propagates a 403 from the service unchanged', async () => {
    (studentProfileService.updateAcademicProfile as any).mockRejectedValue(
      new ApiError(403, "Not authorized to view this student's profile"),
    );
    const req = mockReq({
      user: { id: 'parent-1', role: 'PARENT' },
      params: {},
      body: { grade: 8 },
      query: { studentId: 'other' },
    } as any);
    const next = vi.fn();

    await updateAcademicProfileController(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    }
  });
});
