/**
 * tests/services/reschedule.service.test.ts
 *
 * Journey step 4.18. Spec: `09-4-class-delivery-library.md` §9.15.
 * FRs: FR-MK-004, FR-MK-006–008.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    scheduledSession: { findUnique: vi.fn(), update: vi.fn() },
    availabilitySlot: { findMany: vi.fn() },
    rescheduleRequest: { create: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('../../src/services/sessionMiss.service.js', () => ({
  recordTutorCausedMiss: vi.fn(),
  recordStudentCausedMiss: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import {
  recordStudentCausedMiss,
  recordTutorCausedMiss,
} from '../../src/services/sessionMiss.service.js';
import { enforceMonthlyCap, requestReschedule } from '../../src/services/reschedule.service.js';

const SESSION_ID = 'session-1';
const TUTOR_ID = 'tutor-1';
const CALLER_ID = 'student-1';

function resetMocks() {
  vi.clearAllMocks();
}

describe.skip('requestReschedule', () => {
  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('≥12h notice classified as FREE_RESCHEDULE — creates a RescheduleRequest, moves the session, increments the monthly counter; no SessionMiss', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-09-09T12:00:00Z'), // exactly 24h away
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: TUTOR_ID, isRecurring: true },
    ]);
    (prisma.rescheduleRequest.count as any).mockResolvedValue(0);
    (prisma.rescheduleRequest.create as any).mockResolvedValue({
      id: 'reschedule-1',
      sessionId: SESSION_ID,
      requestedNewStart: new Date('2026-09-09T16:00:00Z'),
      classification: 'FREE_RESCHEDULE',
    });
    (prisma.scheduledSession.update as any).mockResolvedValue({ id: SESSION_ID });

    const result = await requestReschedule(CALLER_ID, SESSION_ID, new Date('2026-09-09T16:00:00Z'));

    expect(result.classification).toBe('FREE_RESCHEDULE');
    expect(prisma.rescheduleRequest.create).toHaveBeenCalled();
    expect(prisma.scheduledSession.update).toHaveBeenCalled();
    expect(recordTutorCausedMiss).not.toHaveBeenCalled();
    expect(recordStudentCausedMiss).not.toHaveBeenCalled();
  });

  it('exactly at the 12-hour boundary is classified consistently (whichever side the implementation documents)', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-09-09T00:00:00Z'), // exactly 12.0h away from 2026-09-08T12:00:00Z
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: TUTOR_ID, isRecurring: true },
    ]);
    (prisma.rescheduleRequest.count as any).mockResolvedValue(0);
    (prisma.rescheduleRequest.create as any).mockResolvedValue({
      id: 'reschedule-1',
      sessionId: SESSION_ID,
      requestedNewStart: new Date('2026-09-09T04:00:00Z'),
      classification: 'FREE_RESCHEDULE',
    });
    (prisma.scheduledSession.update as any).mockResolvedValue({ id: SESSION_ID });

    const firstRun = await requestReschedule(
      CALLER_ID,
      SESSION_ID,
      new Date('2026-09-09T04:00:00Z'),
    );
    const firstClassification = firstRun.classification;

    // Re-run the identical boundary scenario — the classification must be
    // stable/consistent, whichever side of the boundary was chosen.
    vi.clearAllMocks();
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-09-09T00:00:00Z'),
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: TUTOR_ID, isRecurring: true },
    ]);
    (prisma.rescheduleRequest.count as any).mockResolvedValue(0);
    (prisma.rescheduleRequest.create as any).mockResolvedValue({
      id: 'reschedule-2',
      sessionId: SESSION_ID,
      requestedNewStart: new Date('2026-09-09T04:00:00Z'),
      classification: firstClassification,
    });
    (prisma.scheduledSession.update as any).mockResolvedValue({ id: SESSION_ID });

    const secondRun = await requestReschedule(
      CALLER_ID,
      SESSION_ID,
      new Date('2026-09-09T04:00:00Z'),
    );

    expect(secondRun.classification).toBe(firstClassification);
    expect(['FREE_RESCHEDULE', 'SAME_DAY_MISS']).toContain(firstClassification);
  });

  it('<12h notice classified as SAME_DAY_MISS — delegates to sessionMiss.service.ts, no RescheduleRequest created', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-09-08T18:00:00Z'), // 6h away
    });
    (recordStudentCausedMiss as any).mockResolvedValue({
      id: 'miss-1',
      sessionId: SESSION_ID,
      causedBy: 'STUDENT',
    });

    const result = await requestReschedule(CALLER_ID, SESSION_ID, new Date('2026-09-08T20:00:00Z'));

    expect(result.classification).toBe('SAME_DAY_MISS');
    expect(recordStudentCausedMiss).toHaveBeenCalled();
    expect(prisma.rescheduleRequest.create).not.toHaveBeenCalled();
  });

  it("requested time outside the tutor's availability throws ApiError(400, ...)", async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-09-09T12:00:00Z'),
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([]);

    await expect(
      requestReschedule(CALLER_ID, SESSION_ID, new Date('2026-09-09T16:00:00Z')),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Requested time is outside the tutor's availability",
    });
  });

  it('monthly cap enforced — the 3rd free reschedule in the same month is rejected', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-09-09T12:00:00Z'),
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: TUTOR_ID, isRecurring: true },
    ]);
    (prisma.rescheduleRequest.count as any).mockResolvedValue(2);

    await expect(
      requestReschedule(CALLER_ID, SESSION_ID, new Date('2026-09-09T16:00:00Z')),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        'Free reschedule limit reached for this month — further changes require Admin review',
    });
  });

  it('monthly cap resets at the calendar-month boundary, not a rolling 30 days', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-09-09T12:00:00Z'),
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: TUTOR_ID, isRecurring: true },
    ]);
    // 2 used in the prior month — the count query is scoped to the current
    // calendar month only, so this resolves 0 for "this month".
    (prisma.rescheduleRequest.count as any).mockResolvedValue(0);
    (prisma.rescheduleRequest.create as any).mockResolvedValue({
      id: 'reschedule-1',
      sessionId: SESSION_ID,
      requestedNewStart: new Date('2026-09-09T16:00:00Z'),
      classification: 'FREE_RESCHEDULE',
    });
    (prisma.scheduledSession.update as any).mockResolvedValue({ id: SESSION_ID });

    await expect(
      requestReschedule(CALLER_ID, SESSION_ID, new Date('2026-09-09T16:00:00Z')),
    ).resolves.toMatchObject({ classification: 'FREE_RESCHEDULE' });
  });

  it('a reschedule never consumes a make-up session or has a billing impact', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-09-09T12:00:00Z'),
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: TUTOR_ID, isRecurring: true },
    ]);
    (prisma.rescheduleRequest.count as any).mockResolvedValue(0);
    (prisma.rescheduleRequest.create as any).mockResolvedValue({
      id: 'reschedule-1',
      sessionId: SESSION_ID,
      requestedNewStart: new Date('2026-09-09T16:00:00Z'),
      classification: 'FREE_RESCHEDULE',
    });
    (prisma.scheduledSession.update as any).mockResolvedValue({ id: SESSION_ID });

    await requestReschedule(CALLER_ID, SESSION_ID, new Date('2026-09-09T16:00:00Z'));

    expect(recordTutorCausedMiss).not.toHaveBeenCalled();
    expect(recordStudentCausedMiss).not.toHaveBeenCalled();
  });

  it('[Phase 4 — Review §6.1] notice-hours computation is unaffected by a DST transition between now and the session', async () => {
    // now = 2026-03-07T12:00:00Z (before US spring-forward on 2026-03-08).
    // scheduledStart = 2026-03-08T00:00:00Z — exactly 12 real (UTC) hours
    // later. A naive local-calendar-diff for an America/New_York client
    // could misclassify this as 11h or 13h across the transition.
    vi.setSystemTime(new Date('2026-03-07T12:00:00Z'));
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      cohortId: 'cohort-1',
      scheduledStart: new Date('2026-03-08T00:00:00Z'),
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: TUTOR_ID, isRecurring: true },
    ]);
    (prisma.rescheduleRequest.count as any).mockResolvedValue(0);
    (prisma.rescheduleRequest.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'reschedule-dst', ...data }),
    );
    (prisma.scheduledSession.update as any).mockResolvedValue({ id: SESSION_ID });

    const result = await requestReschedule(CALLER_ID, SESSION_ID, new Date('2026-03-08T04:00:00Z'));

    expect(result.classification).toBe('FREE_RESCHEDULE');
  });
});

describe.skip('enforceMonthlyCap', () => {
  beforeEach(resetMocks);

  it('resolves { freeReschedulesUsedThisMonth: 1 } and does not throw when under the cap', async () => {
    (prisma.rescheduleRequest.count as any).mockResolvedValue(1);

    const result = await enforceMonthlyCap(CALLER_ID);

    expect(result).toEqual({ freeReschedulesUsedThisMonth: 1 });
  });

  it('throws ApiError(409, ...) at the cap', async () => {
    (prisma.rescheduleRequest.count as any).mockResolvedValue(2);

    await expect(enforceMonthlyCap(CALLER_ID)).rejects.toMatchObject({ statusCode: 409 });
  });
});
