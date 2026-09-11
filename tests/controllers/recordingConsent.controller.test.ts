/**
 * tests/controllers/recordingConsent.controller.test.ts
 *
 * Journey step 4.7. Spec: `09-4-class-delivery-library.md` §9.7.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/recordingConsent.service.js', () => ({
  getConsentStatus: vi.fn(),
  acknowledgeAsStudentOrParent: vi.fn(),
  acknowledgeAsTutor: vi.fn(),
}));

import * as recordingConsentService from '../../src/services/recordingConsent.service.js';
import { acknowledge, getStatus } from '../../src/controllers/recordingConsent.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('recordingConsent.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getStatus delegates with req.query.tutorId/studentId', async () => {
    (recordingConsentService.getConsentStatus as any).mockResolvedValue({
      tutorId: 't1',
      studentId: 's1',
      tutorAcknowledgedAt: null,
      studentOrParentAcknowledgedAt: null,
      consentComplete: false,
    });
    const req = mockReq({ query: { tutorId: 't1', studentId: 's1' } });
    const res = mockRes();

    await getStatus(req, res, vi.fn());

    expect(recordingConsentService.getConsentStatus).toHaveBeenCalledWith('t1', 's1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('acknowledge branches to acknowledgeAsStudentOrParent for a Student caller', async () => {
    (recordingConsentService.acknowledgeAsStudentOrParent as any).mockResolvedValue({
      tutorId: 't1',
      studentId: 's1',
      consentComplete: false,
    });
    const req = mockReq({
      body: { tutorId: 't1', studentId: 's1' },
      user: { id: 's1', role: 'STUDENT' },
    } as any);

    await acknowledge(req, mockRes(), vi.fn());

    expect(recordingConsentService.acknowledgeAsStudentOrParent).toHaveBeenCalledWith(
      's1',
      't1',
      's1',
    );
    expect(recordingConsentService.acknowledgeAsTutor).not.toHaveBeenCalled();
  });

  it('acknowledge branches to acknowledgeAsTutor for a Tutor caller', async () => {
    (recordingConsentService.acknowledgeAsTutor as any).mockResolvedValue({
      tutorId: 't1',
      studentId: 's1',
      consentComplete: true,
    });
    const req = mockReq({
      body: { tutorId: 't1', studentId: 's1' },
      user: { id: 't1', role: 'TUTOR' },
    } as any);

    await acknowledge(req, mockRes(), vi.fn());

    expect(recordingConsentService.acknowledgeAsTutor).toHaveBeenCalledWith('t1', 't1', 's1');
    expect(recordingConsentService.acknowledgeAsStudentOrParent).not.toHaveBeenCalled();
  });

  it('acknowledge as a Parent also routes to the student-side function — Parent treated as the student-side party', async () => {
    (recordingConsentService.acknowledgeAsStudentOrParent as any).mockResolvedValue({
      tutorId: 't1',
      studentId: 's1',
      consentComplete: false,
    });
    const req = mockReq({
      body: { tutorId: 't1', studentId: 's1' },
      user: { id: 'parent-1', role: 'PARENT' },
    } as any);

    await acknowledge(req, mockRes(), vi.fn());

    expect(recordingConsentService.acknowledgeAsStudentOrParent).toHaveBeenCalledWith(
      'parent-1',
      't1',
      's1',
    );
    expect(recordingConsentService.acknowledgeAsTutor).not.toHaveBeenCalled();
  });
});
