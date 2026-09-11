/**
 * tests/services/sessionMiss.service.test.ts
 *
 * Journey step 4.21. Spec: `09-4-class-delivery-library.md` §9.17.
 * FRs: FR-MK-001–003, FR-MK-009.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    sessionMiss: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    scheduledSession: { findUnique: vi.fn() },
  },
}));

vi.mock('../../src/services/session.service.js', () => ({
  generateMakeupSession: vi.fn(),
}));

vi.mock('../../src/services/notification.service.js', () => ({
  sendNotification: vi.fn(),
}));

vi.mock('../../src/services/refund.service.js', () => ({
  createPendingRefund: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { generateMakeupSession } from '../../src/services/session.service.js';
import { createPendingRefund } from '../../src/services/refund.service.js';
import {
  checkTutorEscalation,
  recordStudentCausedMiss,
  recordTutorCausedMiss,
} from '../../src/services/sessionMiss.service.js';

const SESSION_ID = 'session-1';
const TUTOR_ID = 'tutor-1';

function resetMocks() {
  vi.clearAllMocks();
}

describe.skip('recordTutorCausedMiss', () => {
  beforeEach(resetMocks);

  it('records the miss and queues a free make-up — makeupDeadline = now + 7 days', async () => {
    (prisma.sessionMiss.findUnique as any).mockResolvedValue(null);
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledEnd: new Date('2026-09-08T17:00:00Z'),
    });
    (generateMakeupSession as any).mockResolvedValue({ id: 'makeup-session-1' });
    (prisma.sessionMiss.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'miss-1', ...data }),
    );

    const result = await recordTutorCausedMiss(SESSION_ID, 'NO_SHOW');

    expect(result.causedBy).toBe('TUTOR');
    expect(generateMakeupSession).toHaveBeenCalled();
    expect(result.makeupSessionId).toBe('makeup-session-1');
    const deadlineMs = new Date(result.makeupDeadline).getTime();
    const expectedMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(deadlineMs - expectedMs)).toBeLessThan(60_000);
  });

  it('the make-up is flagged for the reduced tutor rate — asserts the flag is set, not the payout math', async () => {
    (prisma.sessionMiss.findUnique as any).mockResolvedValue(null);
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledEnd: new Date(),
    });
    (generateMakeupSession as any).mockResolvedValue({ id: 'makeup-session-1' });
    (prisma.sessionMiss.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'miss-1', ...data }),
    );

    const result = await recordTutorCausedMiss(SESSION_ID, 'NO_SHOW');

    expect(result.tutorEarningRateForMakeup).toBe('REDUCED_MAKEUP');
  });

  it('no refund/credit issued for the missed session itself', async () => {
    (prisma.sessionMiss.findUnique as any).mockResolvedValue(null);
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledEnd: new Date(),
    });
    (generateMakeupSession as any).mockResolvedValue({ id: 'makeup-session-1' });
    (prisma.sessionMiss.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'miss-1', ...data }),
    );

    await recordTutorCausedMiss(SESSION_ID, 'NO_SHOW');

    expect(createPendingRefund).not.toHaveBeenCalled();
  });

  it('duplicate miss for the same session rejected with ApiError(409, ...)', async () => {
    (prisma.sessionMiss.findUnique as any).mockResolvedValue({
      id: 'existing-miss',
      sessionId: SESSION_ID,
    });

    await expect(recordTutorCausedMiss(SESSION_ID, 'NO_SHOW')).rejects.toMatchObject({
      statusCode: 409,
      message: 'A miss has already been recorded for this session',
    });
  });

  it('escalation check fires after the 2nd tutor-caused miss in 30 days — checkTutorEscalation resolves true', async () => {
    (prisma.sessionMiss.findUnique as any).mockResolvedValue(null);
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledEnd: new Date(),
    });
    (generateMakeupSession as any).mockResolvedValue({ id: 'makeup-session-1' });
    (prisma.sessionMiss.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'miss-2', ...data }),
    );

    await recordTutorCausedMiss(SESSION_ID, 'NO_SHOW');

    (prisma.sessionMiss.findMany as any).mockResolvedValue([
      {
        id: 'miss-1',
        causedBy: 'TUTOR',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
      },
      { id: 'miss-2', causedBy: 'TUTOR', createdAt: new Date() },
    ]);

    const escalated = await checkTutorEscalation(TUTOR_ID);

    expect(escalated).toBe(true);
  });
});

describe.skip('recordStudentCausedMiss', () => {
  beforeEach(resetMocks);

  it('records the miss with no make-up — session still counts as delivered against the billed month', async () => {
    (prisma.sessionMiss.findUnique as any).mockResolvedValue(null);
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledEnd: new Date(),
    });
    (prisma.sessionMiss.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'miss-1', ...data }),
    );

    const result = await recordStudentCausedMiss(SESSION_ID, 'NO_SHOW');

    expect(result.causedBy).toBe('STUDENT');
    expect(result.makeupSessionId).toBeNull();
    expect(generateMakeupSession).not.toHaveBeenCalled();
  });

  it('tutor paid full share for a student-caused miss — no REDUCED_MAKEUP flag set anywhere', async () => {
    (prisma.sessionMiss.findUnique as any).mockResolvedValue(null);
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledEnd: new Date(),
    });
    (prisma.sessionMiss.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'miss-1', ...data }),
    );

    const result = await recordStudentCausedMiss(SESSION_ID, 'NO_SHOW');

    expect(result.tutorEarningRateForOriginalSession).toBe('FULL');
    expect(JSON.stringify(result)).not.toContain('REDUCED_MAKEUP');
  });

  it('duplicate miss rejected with the identical ApiError(409, ...)', async () => {
    (prisma.sessionMiss.findUnique as any).mockResolvedValue({
      id: 'existing-miss',
      sessionId: SESSION_ID,
    });

    await expect(recordStudentCausedMiss(SESSION_ID, 'NO_SHOW')).rejects.toMatchObject({
      statusCode: 409,
      message: 'A miss has already been recorded for this session',
    });
  });
});

describe.skip('checkTutorEscalation', () => {
  beforeEach(resetMocks);

  it('below threshold — 1 tutor-caused miss in the last 30 days resolves false', async () => {
    (prisma.sessionMiss.findMany as any).mockResolvedValue([
      {
        id: 'miss-1',
        causedBy: 'TUTOR',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
      },
    ]);

    await expect(checkTutorEscalation(TUTOR_ID)).resolves.toBe(false);
  });

  it('at threshold — exactly 2 tutor-caused misses within the last 30 days resolves true', async () => {
    (prisma.sessionMiss.findMany as any).mockResolvedValue([
      {
        id: 'miss-1',
        causedBy: 'TUTOR',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
      },
      {
        id: 'miss-2',
        causedBy: 'TUTOR',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
      },
    ]);

    await expect(checkTutorEscalation(TUTOR_ID)).resolves.toBe(true);
  });

  it('misses outside the 30-day window (31+ days ago) do not count', async () => {
    (prisma.sessionMiss.findMany as any).mockResolvedValue([
      {
        id: 'miss-1',
        causedBy: 'TUTOR',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 31),
      },
      {
        id: 'miss-2',
        causedBy: 'TUTOR',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
      },
    ]);

    await expect(checkTutorEscalation(TUTOR_ID)).resolves.toBe(false);
  });

  it('is computed at query time, never a stored/cached counter — a second call reflects a newly inserted miss immediately', async () => {
    (prisma.sessionMiss.findMany as any).mockResolvedValueOnce([
      { id: 'miss-1', causedBy: 'TUTOR', createdAt: new Date() },
    ]);
    const first = await checkTutorEscalation(TUTOR_ID);
    expect(first).toBe(false);

    (prisma.sessionMiss.findMany as any).mockResolvedValueOnce([
      { id: 'miss-1', causedBy: 'TUTOR', createdAt: new Date() },
      { id: 'miss-2', causedBy: 'TUTOR', createdAt: new Date() },
    ]);
    const second = await checkTutorEscalation(TUTOR_ID);
    expect(second).toBe(true);
  });

  it('student-caused misses never count toward tutor escalation — 5 STUDENT-caused misses still resolves false', async () => {
    (prisma.sessionMiss.findMany as any).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `miss-${i}`,
        causedBy: 'STUDENT',
        createdAt: new Date(),
      })),
    );

    await expect(checkTutorEscalation(TUTOR_ID)).resolves.toBe(false);
  });
});
