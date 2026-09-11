/**
 * tests/routes/recordingConsent.routes.test.ts
 *
 * Journey step 4.8. Spec: `09-4-class-delivery-library.md` §9.7.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/recordingConsent.service.js', () => ({
  getConsentStatus: vi.fn(),
  acknowledgeAsStudentOrParent: vi.fn(),
  acknowledgeAsTutor: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    if (token === 'parent-token') return { id: 'parent-1', role: 'PARENT' };
    throw new Error('invalid token');
  }),
}));

import * as recordingConsentService from '../../src/services/recordingConsent.service.js';
import app from '../../src/app.js';

const tutorId = '11111111-1111-4111-8111-111111111111';
const studentId = '22222222-2222-4222-8222-222222222222';

describe.skip('recordingConsent.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (recordingConsentService.getConsentStatus as any).mockResolvedValue({
      tutorId,
      studentId,
      tutorAcknowledgedAt: null,
      studentOrParentAcknowledgedAt: null,
      consentComplete: false,
    });
    (recordingConsentService.acknowledgeAsStudentOrParent as any).mockResolvedValue({
      tutorId,
      studentId,
      consentComplete: false,
    });
    (recordingConsentService.acknowledgeAsTutor as any).mockResolvedValue({
      tutorId,
      studentId,
      consentComplete: true,
    });
  });

  it('both routes require auth — 401 with no Authorization header', async () => {
    const status = await request(app).get(
      `/api/v1/recording-consent/status?tutorId=${tutorId}&studentId=${studentId}`,
    );
    const ack = await request(app)
      .post('/api/v1/recording-consent/acknowledge')
      .send({ tutorId, studentId });

    expect(status.status).toBe(401);
    expect(ack.status).toBe(401);
  });

  it('GET /status with a valid token reaches the (mocked) service', async () => {
    const res = await request(app)
      .get(`/api/v1/recording-consent/status?tutorId=${tutorId}&studentId=${studentId}`)
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(200);
    expect(recordingConsentService.getConsentStatus).toHaveBeenCalledWith(tutorId, studentId);
  });

  it('POST /acknowledge branches correctly by role — Student vs Tutor caller for the same pairing', async () => {
    await request(app)
      .post('/api/v1/recording-consent/acknowledge')
      .set('Authorization', 'Bearer student-token')
      .send({ tutorId, studentId });
    await request(app)
      .post('/api/v1/recording-consent/acknowledge')
      .set('Authorization', 'Bearer tutor-token')
      .send({ tutorId, studentId });

    expect(recordingConsentService.acknowledgeAsStudentOrParent).toHaveBeenCalledTimes(1);
    expect(recordingConsentService.acknowledgeAsTutor).toHaveBeenCalledTimes(1);
  });
});
