/**
 * tests/controllers/weeklyAssessment.controller.test.ts
 *
 * Journey step 4.26. Spec: `09-4-class-delivery-library.md` §9.21.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/weeklyAssessment.service.js', () => ({
  submitAssessment: vi.fn(),
  getAssessmentsForStudent: vi.fn(),
}));

import * as weeklyAssessmentService from '../../src/services/weeklyAssessment.service.js';
import { listForMembership, submit } from '../../src/controllers/weeklyAssessment.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('weeklyAssessment.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submit delegates with (req.user.id, req.body)', async () => {
    (weeklyAssessmentService.submitAssessment as any).mockResolvedValue({
      id: 'assessment-1',
      cohortMembershipId: 'membership-1',
      weekStartDate: '2026-09-01',
      tutorFeedback: 'Strong improvement on quadratic equations this week.',
    });
    const body = {
      cohortMembershipId: 'membership-1',
      weekStartDate: '2026-09-01',
      tutorFeedback: 'Strong improvement on quadratic equations this week.',
    };
    const req = mockReq({ body, user: { id: 'tutor-1', role: 'TUTOR' } } as any);
    const res = mockRes();

    await submit(req, res, vi.fn());

    expect(weeklyAssessmentService.submitAssessment).toHaveBeenCalledWith('tutor-1', body);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('listForMembership delegates with (req.user.id, req.params.id)', async () => {
    (weeklyAssessmentService.getAssessmentsForStudent as any).mockResolvedValue([]);
    const req = mockReq({
      params: { id: 'membership-1' },
      user: { id: 'student-1', role: 'STUDENT' },
    } as any);
    const res = mockRes();

    await listForMembership(req, res, vi.fn());

    expect(weeklyAssessmentService.getAssessmentsForStudent).toHaveBeenCalledWith(
      'student-1',
      'membership-1',
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
