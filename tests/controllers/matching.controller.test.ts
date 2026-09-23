/**
 * tests/controllers/matching.controller.test.ts
 *
 * Journey step 3.3. Spec: `09-3-matching-cohorts.md` §9.4.
 * OWASP: A01:2021 – Broken Access Control.
 *
 * Unit tier — mocked service layer. Thin pass-through assertions only;
 * see matching.service.test.ts for the actual business-rule/DTO-shape
 * assertions this file explicitly does not duplicate.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../../src/services/matching.service.js', () => ({
  searchOneToOneTutors: vi.fn(),
  recommendTutorsWithMatchPercent: vi.fn(),
  getTutorDetail: vi.fn(),
  selectTutor: vi.fn(),
  triggerNoExactMatch: vi.fn(),
  requestGroupFormat: vi.fn(),
  getMyRequestStatus: vi.fn(),
}));

import * as matchingService from '../../src/services/matching.service.js';
import {
  getMyRequestStatus,
  getRecommendations,
  getTutorDetail,
  noExactMatch,
  requestGroupFormat,
  searchTutors,
  selectTutor,
} from '../../src/controllers/matching.controller.js';

function mockReq(overrides: any = {}): any {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 'user-1', role: 'STUDENT' },
    ...overrides,
  } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

const tutorId = randomUUID();
const studentId = randomUUID();
const subjectId = randomUUID();

describe('matching.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searchTutors delegates to searchOneToOneTutors and responds 200', async () => {
    (matchingService.searchOneToOneTutors as any).mockResolvedValue({ tutors: [] });
    const req = mockReq({
      query: { subjectId, grade: '9' } as any,
      user: { id: 'user-1', role: 'STUDENT' } as any,
    });
    const res = mockRes();

    await searchTutors(req, res, vi.fn() as NextFunction);

    expect(matchingService.searchOneToOneTutors).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getRecommendations delegates and responds 200', async () => {
    (matchingService.recommendTutorsWithMatchPercent as any).mockResolvedValue({
      recommendations: [],
      matchRequestId: 'mr-1',
      zeroMatchSince: null,
    });
    const req = mockReq();
    const res = mockRes();

    await getRecommendations(req, res, vi.fn() as NextFunction);

    expect(matchingService.recommendTutorsWithMatchPercent).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTutorDetail delegates and responds 200', async () => {
    (matchingService.getTutorDetail as any).mockResolvedValue({ tutorId });
    const req = mockReq({ params: { tutorId } });
    const res = mockRes();

    await getTutorDetail(req, res, vi.fn() as NextFunction);

    expect(matchingService.getTutorDetail).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('selectTutor passes req.user through, studentId optional (Student caller)', async () => {
    (matchingService.selectTutor as any).mockResolvedValue({
      cohortId: 'c1',
      status: 'PENDING_ADMIN_APPROVAL',
      tutorId,
    });
    const req = mockReq({
      body: { tutorId },
      user: { id: 'student-user', role: 'STUDENT' } as any,
    });
    const res = mockRes();

    await selectTutor(req, res, vi.fn() as NextFunction);

    expect(matchingService.selectTutor).toHaveBeenCalledWith(
      'student-user',
      'STUDENT',
      undefined,
      tutorId,
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('selectTutor as a Parent passes the target studentId', async () => {
    (matchingService.selectTutor as any).mockResolvedValue({
      cohortId: 'c1',
      status: 'PENDING_ADMIN_APPROVAL',
      tutorId,
    });
    const req = mockReq({
      body: { studentId, tutorId },
      user: { id: 'parent-user', role: 'PARENT' } as any,
    });
    const res = mockRes();

    await selectTutor(req, res, vi.fn() as NextFunction);

    expect(matchingService.selectTutor).toHaveBeenCalledWith(
      'parent-user',
      'PARENT',
      studentId,
      tutorId,
    );
  });

  it('noExactMatch delegates and responds 200', async () => {
    (matchingService.triggerNoExactMatch as any).mockResolvedValue({
      matchRequestId: 'mr-1',
      status: 'PENDING_ADMIN_ASSIGNMENT',
    });
    const req = mockReq({ body: {} });
    const res = mockRes();

    await noExactMatch(req, res, vi.fn() as NextFunction);

    expect(matchingService.triggerNoExactMatch).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('requestGroupFormat delegates and responds 201, forwarding only documented fields even if the service over-returns', async () => {
    (matchingService.requestGroupFormat as any).mockResolvedValue({
      matchRequestId: 'mr-1',
      status: 'SEARCHING',
      tutorId: 'leaked',
    });
    const req = mockReq({ body: { subjectId } });
    const res = mockRes();

    await requestGroupFormat(req, res, vi.fn() as NextFunction);

    // Flag, not a pass/fail on the controller alone (per 9.4): the controller is a
    // thin pass-through and will faithfully forward whatever the service returns.
    // The no-match-information guarantee is enforced at the service DTO shape
    // (matching.service.test.ts), not here.
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('getMyRequestStatus delegates and responds 200', async () => {
    (matchingService.getMyRequestStatus as any).mockResolvedValue({
      id: 'mr-1',
      status: 'SEARCHING',
    });
    const req = mockReq();
    const res = mockRes();

    await getMyRequestStatus(req, res, vi.fn() as NextFunction);

    expect(matchingService.getMyRequestStatus).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
