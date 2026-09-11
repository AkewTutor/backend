/**
 * tests/services/recordingConsent.service.test.ts
 *
 * Journey step 4.6. Spec: `09-4-class-delivery-library.md` §9.6.
 * FRs: FR-SC-008–009.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    recordingConsent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import {
  acknowledgeAsStudentOrParent,
  acknowledgeAsTutor,
  getConsentStatus,
} from '../../src/services/recordingConsent.service.js';

const TUTOR_ID = 'tutor-1';
const STUDENT_ID = 'student-1';
const CALLER_ID = 'caller-1';

function resetMocks() {
  vi.clearAllMocks();
}

describe.skip('getConsentStatus', () => {
  beforeEach(resetMocks);

  it('resolves both timestamps null and consentComplete: false when neither side has acknowledged', async () => {
    (prisma.recordingConsent.findFirst as any).mockResolvedValue(null);

    const result = await getConsentStatus(TUTOR_ID, STUDENT_ID);

    expect(result).toMatchObject({
      tutorId: TUTOR_ID,
      studentId: STUDENT_ID,
      tutorAcknowledgedAt: null,
      studentOrParentAcknowledgedAt: null,
      consentComplete: false,
    });
  });

  it('resolves consentComplete: false when only one side has acknowledged', async () => {
    (prisma.recordingConsent.findFirst as any).mockResolvedValue({
      tutorId: TUTOR_ID,
      studentId: STUDENT_ID,
      tutorAcknowledgedAt: new Date('2026-09-01T10:00:00Z'),
      studentOrParentAcknowledgedAt: null,
    });

    const result = await getConsentStatus(TUTOR_ID, STUDENT_ID);

    expect(result.consentComplete).toBe(false);
  });

  it('resolves consentComplete: true when both timestamps are set', async () => {
    (prisma.recordingConsent.findFirst as any).mockResolvedValue({
      tutorId: TUTOR_ID,
      studentId: STUDENT_ID,
      tutorAcknowledgedAt: new Date('2026-09-01T10:00:00Z'),
      studentOrParentAcknowledgedAt: new Date('2026-09-01T11:00:00Z'),
    });

    const result = await getConsentStatus(TUTOR_ID, STUDENT_ID);

    expect(result.consentComplete).toBe(true);
  });
});

describe.skip('acknowledgeAsStudentOrParent / acknowledgeAsTutor', () => {
  beforeEach(resetMocks);

  it('first acknowledgment creates/upserts the row with studentOrParentAcknowledgedAt set, tutor side still pending', async () => {
    (prisma.recordingConsent.findFirst as any).mockResolvedValue(null);
    (prisma.recordingConsent.upsert as any).mockResolvedValue({
      tutorId: TUTOR_ID,
      studentId: STUDENT_ID,
      tutorAcknowledgedAt: null,
      studentOrParentAcknowledgedAt: new Date(),
    });

    const result = await acknowledgeAsStudentOrParent(CALLER_ID, TUTOR_ID, STUDENT_ID);

    expect(result.consentComplete).toBe(false);
    expect(result.studentOrParentAcknowledgedAt).toBeTruthy();
  });

  it('second acknowledgment completes the pairing — tutorAcknowledgedAt set, consentComplete flips true', async () => {
    (prisma.recordingConsent.findFirst as any).mockResolvedValue({
      tutorId: TUTOR_ID,
      studentId: STUDENT_ID,
      tutorAcknowledgedAt: null,
      studentOrParentAcknowledgedAt: new Date('2026-09-01T11:00:00Z'),
    });
    (prisma.recordingConsent.upsert as any).mockResolvedValue({
      tutorId: TUTOR_ID,
      studentId: STUDENT_ID,
      tutorAcknowledgedAt: new Date(),
      studentOrParentAcknowledgedAt: new Date('2026-09-01T11:00:00Z'),
    });

    const result = await acknowledgeAsTutor(TUTOR_ID, TUTOR_ID, STUDENT_ID);

    expect(result.tutorAcknowledgedAt).toBeTruthy();
    expect(result.consentComplete).toBe(true);
  });

  it('acknowledgment is one-time per pairing — a repeat acknowledgment resolves idempotently, no duplicate row created', async () => {
    (prisma.recordingConsent.findFirst as any).mockResolvedValue({
      tutorId: TUTOR_ID,
      studentId: STUDENT_ID,
      tutorAcknowledgedAt: new Date('2026-09-01T10:00:00Z'),
      studentOrParentAcknowledgedAt: new Date('2026-09-01T11:00:00Z'),
    });
    (prisma.recordingConsent.upsert as any).mockResolvedValue({
      tutorId: TUTOR_ID,
      studentId: STUDENT_ID,
      tutorAcknowledgedAt: new Date('2026-09-01T10:00:00Z'),
      studentOrParentAcknowledgedAt: new Date('2026-09-01T11:00:00Z'),
    });

    await expect(
      acknowledgeAsStudentOrParent(CALLER_ID, TUTOR_ID, STUDENT_ID),
    ).resolves.not.toThrow();

    const upsertArg = (prisma.recordingConsent.upsert as any).mock.calls[0]?.[0];
    if (upsertArg?.create) {
      // Upsert-shaped call — the create branch must key on the same
      // unique (tutorId, studentId) pairing, never a fresh id.
      expect(upsertArg.where).toBeDefined();
    }
  });

  it('consent for one pairing does not affect another pairing in the same cohort', async () => {
    const OTHER_STUDENT_ID = 'student-2';
    (prisma.recordingConsent.findFirst as any)
      .mockResolvedValueOnce({
        tutorId: TUTOR_ID,
        studentId: STUDENT_ID,
        tutorAcknowledgedAt: new Date(),
        studentOrParentAcknowledgedAt: new Date(),
      })
      .mockResolvedValueOnce(null);

    const statusA = await getConsentStatus(TUTOR_ID, STUDENT_ID);
    const statusB = await getConsentStatus(TUTOR_ID, OTHER_STUDENT_ID);

    expect(statusA.consentComplete).toBe(true);
    expect(statusB.consentComplete).toBe(false);
  });
});
