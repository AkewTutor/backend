/**
 * tests/services/recording.service.test.ts
 *
 * Journey step 4.10. Spec: `09-4-class-delivery-library.md` §9.9.
 * FRs: FR-SP-035–037, FR-CD-004–008. Section 5.8 (90-day retention, 720p).
 * OWASP: A01:2021 – Broken Access Control (central risk — cross-student/
 * cross-cohort recording access), A04:2021 – Insecure Design (consent-gating
 * is a design-level safety control).
 *
 * Mocks Prisma, `recordingConsent.service.ts`, and `storage.client.ts` — per
 * the Test File Map (§9.1), which orders this file after both of those.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    scheduledSession: { findUnique: vi.fn() },
    cohortMembership: { findMany: vi.fn(), findFirst: vi.fn() },
    recording: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/recordingConsent.service.js', () => ({
  getConsentStatus: vi.fn(),
}));

vi.mock('../../src/utils/providers/storage.client.js', () => ({
  upload: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock('../../src/services/sessionMiss.service.js', () => ({
  recordTutorCausedMiss: vi.fn(),
  recordStudentCausedMiss: vi.fn(),
}));

vi.mock('../../src/services/refund.service.js', () => ({
  createPendingRefund: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { getConsentStatus } from '../../src/services/recordingConsent.service.js';
import {
  getSignedUrl as clientGetSignedUrl,
  upload,
} from '../../src/utils/providers/storage.client.js';
import {
  recordStudentCausedMiss,
  recordTutorCausedMiss,
} from '../../src/services/sessionMiss.service.js';
import { createPendingRefund } from '../../src/services/refund.service.js';
import {
  escalateMissing,
  flagMissing,
  getSignedUrl,
  keepPermanently,
  uploadRecording,
} from '../../src/services/recording.service.js';

const TUTOR_ID = 'tutor-1';
const SESSION_ID = 'session-1';
const COHORT_ID = 'cohort-1';
const RECORDING_ID = 'recording-1';

function resetMocks() {
  vi.clearAllMocks();
  (upload as any).mockResolvedValue({ storageKey: 'recordings/2026/09/key.mp4' });
  (clientGetSignedUrl as any).mockResolvedValue('https://r2.akewtutor.com/signed?sig=abc');
}

describe.skip('uploadRecording', () => {
  beforeEach(resetMocks);

  it('succeeds for a fully-consented 1-to-1 pairing — expiresAt is upload time + 90 days, keepPermanently false', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      tutorId: TUTOR_ID,
    });
    (prisma.cohortMembership.findMany as any).mockResolvedValue([
      { id: 'membership-1', cohortId: COHORT_ID, studentId: 'student-1', status: 'ACTIVE' },
    ]);
    (getConsentStatus as any).mockResolvedValue({ consentComplete: true });
    (prisma.recording.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: RECORDING_ID, ...data }),
    );

    const result = await uploadRecording(TUTOR_ID, SESSION_ID, Buffer.from('video-bytes'));

    expect(result.keepPermanently).toBe(false);
    const expectedExpiry = new Date(new Date(result.expiresAt).getTime());
    const daysDiff = (expectedExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThan(89.9);
    expect(daysDiff).toBeLessThan(90.1);
  });

  it('blocked — 1-to-1 pairing consent incomplete throws ApiError(409, ...)', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      tutorId: TUTOR_ID,
    });
    (prisma.cohortMembership.findMany as any).mockResolvedValue([
      { id: 'membership-1', cohortId: COHORT_ID, studentId: 'student-1', status: 'ACTIVE' },
    ]);
    (getConsentStatus as any).mockResolvedValue({ consentComplete: false });

    await expect(uploadRecording(TUTOR_ID, SESSION_ID, Buffer.from('x'))).rejects.toMatchObject({
      statusCode: 409,
      message:
        'Recording consent must be acknowledged by both parties for every active student before this session can be recorded',
    });
  });

  it('1-to-3/1-to-5 blocked if ANY active member pairing is incomplete — the any-one-incomplete-blocks-all case (2 of 3 complete, 1 incomplete)', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      tutorId: TUTOR_ID,
    });
    (prisma.cohortMembership.findMany as any).mockResolvedValue([
      { id: 'm1', cohortId: COHORT_ID, studentId: 's1', status: 'ACTIVE' },
      { id: 'm2', cohortId: COHORT_ID, studentId: 's2', status: 'ACTIVE' },
      { id: 'm3', cohortId: COHORT_ID, studentId: 's3', status: 'ACTIVE' },
    ]);
    (getConsentStatus as any)
      .mockResolvedValueOnce({ consentComplete: true })
      .mockResolvedValueOnce({ consentComplete: true })
      .mockResolvedValueOnce({ consentComplete: false });

    await expect(uploadRecording(TUTOR_ID, SESSION_ID, Buffer.from('x'))).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prisma.recording.create).not.toHaveBeenCalled();
  });

  it('1-to-3/1-to-5 succeeds once every active member pairing is complete', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      tutorId: TUTOR_ID,
    });
    (prisma.cohortMembership.findMany as any).mockResolvedValue([
      { id: 'm1', cohortId: COHORT_ID, studentId: 's1', status: 'ACTIVE' },
      { id: 'm2', cohortId: COHORT_ID, studentId: 's2', status: 'ACTIVE' },
      { id: 'm3', cohortId: COHORT_ID, studentId: 's3', status: 'ACTIVE' },
    ]);
    (getConsentStatus as any).mockResolvedValue({ consentComplete: true });
    (prisma.recording.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: RECORDING_ID, ...data }),
    );

    await expect(uploadRecording(TUTOR_ID, SESSION_ID, Buffer.from('x'))).resolves.toBeTruthy();
  });

  it('a mid-cycle new joiner with incomplete consent re-blocks future uploads, not cached from a prior successful upload', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: 'session-2',
      cohortId: COHORT_ID,
      tutorId: TUTOR_ID,
    });
    (prisma.cohortMembership.findMany as any).mockResolvedValue([
      { id: 'm1', cohortId: COHORT_ID, studentId: 's1', status: 'ACTIVE' },
      { id: 'm-new', cohortId: COHORT_ID, studentId: 's-new', status: 'ACTIVE' },
    ]);
    (getConsentStatus as any)
      .mockResolvedValueOnce({ consentComplete: true })
      .mockResolvedValueOnce({ consentComplete: false });

    await expect(uploadRecording(TUTOR_ID, 'session-2', Buffer.from('x'))).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('non-assigned tutor rejected with ApiError(403, "Not authorized to upload a recording for this session")', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      tutorId: TUTOR_ID,
    });

    await expect(
      uploadRecording('some-other-tutor', SESSION_ID, Buffer.from('x')),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to upload a recording for this session',
    });
  });

  it('stores at 720p — the storage/encoding call specifies the 720p compressed target', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      tutorId: TUTOR_ID,
    });
    (prisma.cohortMembership.findMany as any).mockResolvedValue([
      { id: 'm1', cohortId: COHORT_ID, studentId: 's1', status: 'ACTIVE' },
    ]);
    (getConsentStatus as any).mockResolvedValue({ consentComplete: true });
    (prisma.recording.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: RECORDING_ID, ...data }),
    );

    const result = await uploadRecording(TUTOR_ID, SESSION_ID, Buffer.from('x'));

    expect(result.encoding).toBe('720p');
  });
});

describe.skip('getSignedUrl (recording playback)', () => {
  beforeEach(resetMocks);

  it('a cohort member retrieves their own recording — resolves { signedUrl, expiresIn: 900 }', async () => {
    (prisma.recording.findUnique as any).mockResolvedValue({
      id: RECORDING_ID,
      sessionId: SESSION_ID,
      storageKey: 'recordings/2026/09/key.mp4',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
      keepPermanently: false,
      deletedAt: null,
      session: { cohortId: COHORT_ID },
    });
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({ id: 'membership-1' });

    const result = await getSignedUrl('student-1', RECORDING_ID);

    expect(result).toMatchObject({ signedUrl: expect.any(String), expiresIn: 900 });
    const presignerCallArgs = (clientGetSignedUrl as any).mock.calls[0];
    expect(presignerCallArgs[1]).toBe(900);
  });

  it("cross-student access denied (IDOR/BOLA) — caller has zero CohortMembership rows for this recording's cohort, ever", async () => {
    (prisma.recording.findUnique as any).mockResolvedValue({
      id: RECORDING_ID,
      sessionId: SESSION_ID,
      storageKey: 'recordings/2026/09/key.mp4',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
      keepPermanently: false,
      deletedAt: null,
      session: { cohortId: COHORT_ID },
    });
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(null);

    await expect(getSignedUrl('unrelated-student', RECORDING_ID)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to access this recording',
    });
  });

  it('a student in a different, real cohort cannot cross into this recording via id-guessing', async () => {
    const COHORT_B_ID = 'cohort-B';
    (prisma.recording.findUnique as any).mockResolvedValue({
      id: 'recording-B',
      sessionId: 'session-B',
      storageKey: 'recordings/2026/09/keyB.mp4',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
      keepPermanently: false,
      deletedAt: null,
      session: { cohortId: COHORT_B_ID },
    });
    // Caller is a genuine member of Cohort A — the lookup is scoped to
    // Cohort B (this recording's real cohort), so it correctly finds nothing.
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(null);

    await expect(getSignedUrl('cohort-a-member', 'recording-B')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to access this recording',
    });
    const findFirstArg = (prisma.cohortMembership.findFirst as any).mock.calls[0][0];
    expect(JSON.stringify(findFirstArg)).toContain(COHORT_B_ID);
  });

  it('past retention, not kept permanently — throws ApiError(404, "Recording no longer available")', async () => {
    (prisma.recording.findUnique as any).mockResolvedValue({
      id: RECORDING_ID,
      sessionId: SESSION_ID,
      storageKey: 'key',
      expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      keepPermanently: false,
      deletedAt: null,
      session: { cohortId: COHORT_ID },
    });
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({ id: 'membership-1' });

    await expect(getSignedUrl('student-1', RECORDING_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Recording no longer available',
    });
  });

  it('past retention but kept permanently — resolves successfully, retention does not apply', async () => {
    (prisma.recording.findUnique as any).mockResolvedValue({
      id: RECORDING_ID,
      sessionId: SESSION_ID,
      storageKey: 'key',
      expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      keepPermanently: true,
      deletedAt: null,
      session: { cohortId: COHORT_ID },
    });
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({ id: 'membership-1' });

    await expect(getSignedUrl('student-1', RECORDING_ID)).resolves.toBeTruthy();
  });

  it('soft-deleted recording throws the identical ApiError(404, "Recording no longer available")', async () => {
    (prisma.recording.findUnique as any).mockResolvedValue({
      id: RECORDING_ID,
      sessionId: SESSION_ID,
      storageKey: 'key',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
      keepPermanently: false,
      deletedAt: new Date(),
      session: { cohortId: COHORT_ID },
    });
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({ id: 'membership-1' });

    await expect(getSignedUrl('student-1', RECORDING_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Recording no longer available',
    });
  });

  it('a tutor retrieves a recording for their own past student — resolves successfully', async () => {
    (prisma.recording.findUnique as any).mockResolvedValue({
      id: RECORDING_ID,
      sessionId: SESSION_ID,
      storageKey: 'key',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
      keepPermanently: false,
      deletedAt: null,
      session: { cohortId: COHORT_ID },
    });
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({
      id: 'membership-1',
      tutorId: TUTOR_ID,
    });

    await expect(getSignedUrl(TUTOR_ID, RECORDING_ID)).resolves.toBeTruthy();
  });
});

describe.skip('keepPermanently', () => {
  beforeEach(resetMocks);

  it('owner marks a recording to keep permanently', async () => {
    (prisma.recording.findUnique as any).mockResolvedValue({
      id: RECORDING_ID,
      sessionId: SESSION_ID,
      keepPermanently: false,
      session: { cohortId: COHORT_ID },
    });
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({ id: 'membership-1' });
    (prisma.recording.update as any).mockResolvedValue({ id: RECORDING_ID, keepPermanently: true });

    const result = await keepPermanently('student-1', RECORDING_ID);

    expect(result).toEqual({ id: RECORDING_ID, keepPermanently: true });
  });

  it('non-member attempts to mark another cohort\'s recording (IDOR) — ApiError(403, "Not authorized to modify this recording")', async () => {
    (prisma.recording.findUnique as any).mockResolvedValue({
      id: RECORDING_ID,
      sessionId: SESSION_ID,
      keepPermanently: false,
      session: { cohortId: COHORT_ID },
    });
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(null);

    await expect(keepPermanently('unrelated-student', RECORDING_ID)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to modify this recording',
    });
  });
});

describe.skip('flagMissing / escalateMissing', () => {
  beforeEach(resetMocks);

  it('flags MISSING at 2h with no recording', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      status: 'COMPLETED',
      scheduledEnd: new Date(Date.now() - 1000 * 60 * 60 * 2.5),
      recording: null,
    });
    const { prisma: prismaWithScheduledSessionUpdate } = await import('../../src/config/db.js');
    (prismaWithScheduledSessionUpdate.scheduledSession as any).update = vi.fn().mockResolvedValue({
      id: SESSION_ID,
      recordingStatus: 'MISSING',
    });

    await flagMissing(SESSION_ID);

    expect((prisma.scheduledSession as any).update).toHaveBeenCalled();
    const updateArg = (prisma.scheduledSession as any).update.mock.calls[0][0];
    expect(updateArg.data.recordingStatus).toBe('MISSING');
  });

  it('escalates at 24h if still missing', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      status: 'COMPLETED',
      scheduledEnd: new Date(Date.now() - 1000 * 60 * 60 * 25),
      recordingStatus: 'MISSING',
      recording: null,
    });
    (prisma.scheduledSession as any).update = vi.fn().mockResolvedValue({
      id: SESSION_ID,
      recordingStatus: 'ESCALATED',
    });

    await escalateMissing(SESSION_ID);

    const updateArg = (prisma.scheduledSession as any).update.mock.calls[0][0];
    expect(updateArg.data.recordingStatus).toBe('ESCALATED');
  });

  it('does not flag a session that already has a recording', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      status: 'COMPLETED',
      scheduledEnd: new Date(Date.now() - 1000 * 60 * 60 * 3),
      recording: { id: RECORDING_ID },
    });
    (prisma.scheduledSession as any).update = vi.fn();

    await flagMissing(SESSION_ID);

    expect((prisma.scheduledSession as any).update).not.toHaveBeenCalled();
  });

  it('missing recording alone does not trigger a refund or make-up', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      status: 'COMPLETED',
      scheduledEnd: new Date(Date.now() - 1000 * 60 * 60 * 25),
      recordingStatus: 'MISSING',
      recording: null,
    });
    (prisma.scheduledSession as any).update = vi.fn().mockResolvedValue({});

    await flagMissing(SESSION_ID);
    await escalateMissing(SESSION_ID);

    expect(recordTutorCausedMiss).not.toHaveBeenCalled();
    expect(recordStudentCausedMiss).not.toHaveBeenCalled();
    expect(createPendingRefund).not.toHaveBeenCalled();
  });
});
