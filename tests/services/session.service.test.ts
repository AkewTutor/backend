/**
 * tests/services/session.service.test.ts
 *
 * Journey step 4.2. Spec: `09-4-class-delivery-library.md` §9.3.
 * FRs: FR-CD-001–003, FR-CD-006, FR-AC-008 (`assertSessionAccessAllowed` —
 * gap closed). Section 7 v3.2 cadence/billing.
 * OWASP: A01:2021 – Broken Access Control.
 *
 * Unit tier — Prisma mocked. `assertAccountStatusAllowsAccess` (accounts-
 * guardianship's studentProfile.service.ts) is mocked as a cross-feature call
 * per feature-decomposition.md §1.1 — no FK, so it's reached via a direct
 * service import, not a Prisma join.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    cohort: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    availabilitySlot: {
      findMany: vi.fn(),
    },
    cohortMembership: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    scheduledSession: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/studentProfile.service.js', () => ({
  assertAccountStatusAllowsAccess: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { assertAccountStatusAllowsAccess } from '../../src/services/studentProfile.service.js';
import {
  assertSessionAccessAllowed,
  generateSessionsForCohort,
  markCompleted,
  provideJitsiLink,
} from '../../src/services/session.service.js';
import ApiError from '../../src/utils/ApiError.js';

const COHORT_ID = 'cohort-1';
const TUTOR_ID = 'tutor-1';
const SESSION_ID = 'session-1';
const STUDENT_ID = 'student-1';
const PARENT_ID = 'parent-1';
const ADMIN_ID = 'admin-1';

function resetMocks() {
  vi.clearAllMocks();
  (assertAccountStatusAllowsAccess as any).mockResolvedValue(undefined);
}

describe.skip('generateSessionsForCohort', () => {
  beforeEach(resetMocks);

  it('sets Cohort.sessionsPerWeek from the count of distinct matched recurring AvailabilitySlots', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: COHORT_ID,
      tutorId: TUTOR_ID,
      sessionsPerWeek: null,
      status: 'PENDING_PAYMENT',
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: TUTOR_ID, isRecurring: true },
      { id: 'slot-2', tutorId: TUTOR_ID, isRecurring: true },
    ]);
    (prisma.scheduledSession.findMany as any).mockResolvedValue([]);
    (prisma.cohort.update as any).mockResolvedValue({ id: COHORT_ID, sessionsPerWeek: 2 });
    (prisma.scheduledSession.createMany as any).mockResolvedValue({ count: 8 });

    await generateSessionsForCohort(COHORT_ID);

    const updateArg = (prisma.cohort.update as any).mock.calls[0][0];
    expect(updateArg.data.sessionsPerWeek).toBe(2);
  });

  it('generates sessionsPerWeek × 4 sessions for the cycle — 8 SCHEDULED rows for the authoritative worked example', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: COHORT_ID,
      tutorId: TUTOR_ID,
      sessionsPerWeek: null,
      status: 'PENDING_PAYMENT',
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: TUTOR_ID, isRecurring: true },
      { id: 'slot-2', tutorId: TUTOR_ID, isRecurring: true },
    ]);
    (prisma.scheduledSession.findMany as any).mockResolvedValue([]);
    (prisma.cohort.update as any).mockResolvedValue({ id: COHORT_ID, sessionsPerWeek: 2 });
    (prisma.scheduledSession.createMany as any).mockResolvedValue({ count: 8 });

    await generateSessionsForCohort(COHORT_ID);

    const createManyArg = (prisma.scheduledSession.createMany as any).mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(8);
    expect(createManyArg.data.every((row: any) => row.status === 'SCHEDULED')).toBe(true);
  });

  it('does not double-generate on a re-run for the same cycle — guarded by checking for existing sessions first', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: COHORT_ID,
      tutorId: TUTOR_ID,
      sessionsPerWeek: 2,
      status: 'ACTIVE',
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: TUTOR_ID, isRecurring: true },
      { id: 'slot-2', tutorId: TUTOR_ID, isRecurring: true },
    ]);
    (prisma.scheduledSession.findMany as any).mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({ id: `existing-${i}`, cohortId: COHORT_ID })),
    );

    await generateSessionsForCohort(COHORT_ID);

    expect(prisma.scheduledSession.createMany).not.toHaveBeenCalled();
  });

  it('does not overwrite an already-set sessionsPerWeek even if current availability would now compute differently', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: COHORT_ID,
      tutorId: TUTOR_ID,
      sessionsPerWeek: 2,
      status: 'ACTIVE',
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: TUTOR_ID, isRecurring: true },
      { id: 'slot-2', tutorId: TUTOR_ID, isRecurring: true },
      { id: 'slot-3', tutorId: TUTOR_ID, isRecurring: true },
    ]);
    (prisma.scheduledSession.findMany as any).mockResolvedValue([]);
    (prisma.scheduledSession.createMany as any).mockResolvedValue({ count: 8 });

    await generateSessionsForCohort(COHORT_ID);

    const updateCalls = (prisma.cohort.update as any).mock.calls;
    const sessionsPerWeekChanged = updateCalls.some(
      (call: any[]) =>
        call[0]?.data?.sessionsPerWeek !== undefined && call[0].data.sessionsPerWeek !== 2,
    );
    expect(sessionsPerWeekChanged).toBe(false);
  });

  it("a tutor's later availability edits never affect an ACTIVE cohort's cadence", async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: COHORT_ID,
      tutorId: TUTOR_ID,
      sessionsPerWeek: 2,
      status: 'ACTIVE',
    });
    // Tutor has since removed/added slots — availability now computes to a different count.
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: TUTOR_ID, isRecurring: true },
    ]);
    (prisma.scheduledSession.findMany as any).mockResolvedValue([]);
    (prisma.scheduledSession.createMany as any).mockResolvedValue({ count: 8 });

    await generateSessionsForCohort(COHORT_ID);

    const updateCalls = (prisma.cohort.update as any).mock.calls;
    const sessionsPerWeekChanged = updateCalls.some(
      (call: any[]) =>
        call[0]?.data?.sessionsPerWeek !== undefined && call[0].data.sessionsPerWeek !== 2,
    );
    expect(sessionsPerWeekChanged).toBe(false);
  });

  it('[Phase 4 — Review §6.1] weekly recurring sessions keep the same local wall-clock time across a DST transition', async () => {
    // America/New_York DST spring-forward in 2026 is 2026-03-08. A recurring
    // slot agreed as "4:00 PM Eastern" is stored as the UTC instant for that
    // local time on its anchor date. Each subsequent weekly occurrence must
    // still land on 4:00 PM Eastern, even though the UTC offset shifts by an
    // hour across the transition (EST = UTC-5, EDT = UTC-4).
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: COHORT_ID,
      tutorId: TUTOR_ID,
      sessionsPerWeek: null,
      status: 'PENDING_PAYMENT',
    });
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      {
        id: 'slot-dst',
        tutorId: TUTOR_ID,
        isRecurring: true,
        // 4:00 PM EST on 2026-03-01 (before the transition) = 21:00 UTC.
        startTime: new Date('2026-03-01T21:00:00Z'),
        endTime: new Date('2026-03-01T22:00:00Z'),
      },
    ]);
    (prisma.scheduledSession.findMany as any).mockResolvedValue([]);
    (prisma.cohort.update as any).mockResolvedValue({ id: COHORT_ID, sessionsPerWeek: 1 });
    (prisma.scheduledSession.createMany as any).mockResolvedValue({ count: 4 });

    await generateSessionsForCohort(COHORT_ID);

    const createManyArg = (prisma.scheduledSession.createMany as any).mock.calls[0][0];
    const localHours = createManyArg.data.map((row: any) => {
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(row.scheduledStart));
      return formatted;
    });

    expect(new Set(localHours).size).toBe(1);
  });
});

describe.skip('provideJitsiLink', () => {
  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves providedLateNotice: false when submitted ≥30 minutes before start', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      scheduledStart: new Date('2026-09-08T15:45:00Z'), // 45 min away
      status: 'SCHEDULED',
    });
    (prisma.scheduledSession.update as any).mockResolvedValue({
      id: SESSION_ID,
      jitsiLinkUrl: 'https://meet.jit.si/abc',
      jitsiLinkSentAt: new Date(),
      providedLateNotice: false,
    });

    const result = await provideJitsiLink(TUTOR_ID, SESSION_ID, 'https://meet.jit.si/abc');

    expect(result).toMatchObject({ providedLateNotice: false });
    expect(result.id).toBe(SESSION_ID);
    expect(result.jitsiLinkUrl).toBe('https://meet.jit.si/abc');
    expect(result.jitsiLinkSentAt).toBeTruthy();
  });

  it('resolves providedLateNotice: false at exactly the 30-minute boundary', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      scheduledStart: new Date('2026-09-08T15:30:00Z'), // exactly 30 min away
      status: 'SCHEDULED',
    });
    (prisma.scheduledSession.update as any).mockResolvedValue({
      id: SESSION_ID,
      jitsiLinkUrl: 'https://meet.jit.si/abc',
      jitsiLinkSentAt: new Date(),
      providedLateNotice: false,
    });

    const result = await provideJitsiLink(TUTOR_ID, SESSION_ID, 'https://meet.jit.si/abc');

    expect(result.providedLateNotice).toBe(false);
  });

  it('resolves successfully (not blocked) with providedLateNotice: true under 30 minutes before start', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      scheduledStart: new Date('2026-09-08T15:10:00Z'), // 10 min away
      status: 'SCHEDULED',
    });
    (prisma.scheduledSession.update as any).mockResolvedValue({
      id: SESSION_ID,
      jitsiLinkUrl: 'https://meet.jit.si/abc',
      jitsiLinkSentAt: new Date(),
      providedLateNotice: true,
    });

    const result = await provideJitsiLink(TUTOR_ID, SESSION_ID, 'https://meet.jit.si/abc');

    expect(result.providedLateNotice).toBe(true);
  });

  it('still resolves (not rejected) with providedLateNotice: true even when scheduledStart is already in the past', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      scheduledStart: new Date('2026-09-08T14:30:00Z'), // 30 min in the past
      status: 'SCHEDULED',
    });
    (prisma.scheduledSession.update as any).mockResolvedValue({
      id: SESSION_ID,
      jitsiLinkUrl: 'https://meet.jit.si/abc',
      jitsiLinkSentAt: new Date(),
      providedLateNotice: true,
    });

    await expect(
      provideJitsiLink(TUTOR_ID, SESSION_ID, 'https://meet.jit.si/abc'),
    ).resolves.toMatchObject({
      providedLateNotice: true,
    });
  });

  it('non-assigned tutor rejected (IDOR) — ApiError(403, "Not authorized to provide a link for this session")', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      scheduledStart: new Date('2026-09-08T15:45:00Z'),
      status: 'SCHEDULED',
    });

    await expect(
      provideJitsiLink('some-other-tutor', SESSION_ID, 'https://meet.jit.si/abc'),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to provide a link for this session',
    });
  });
});

describe.skip('assertSessionAccessAllowed', () => {
  beforeEach(resetMocks);

  it('a Student caller with an ACTIVE account and a real membership resolves the ScheduledSession row', async () => {
    (assertAccountStatusAllowsAccess as any).mockResolvedValue(undefined);
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
    });
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({
      id: 'membership-1',
      cohortId: COHORT_ID,
      studentId: STUDENT_ID,
    });

    const result = await assertSessionAccessAllowed(STUDENT_ID, 'STUDENT', SESSION_ID);

    expect(result.id).toBe(SESSION_ID);
  });

  it('Student/Parent blocked on the guardian-hold — the same ApiError(403, ...) propagates unmodified, before the membership check', async () => {
    const holdError = new ApiError(403, 'Account access is on hold pending guardian action');
    (assertAccountStatusAllowsAccess as any).mockRejectedValue(holdError);
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
    });

    await expect(
      assertSessionAccessAllowed(STUDENT_ID, 'STUDENT', SESSION_ID),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Account access is on hold pending guardian action',
    });
    expect(prisma.cohortMembership.findFirst).not.toHaveBeenCalled();
  });

  it("a Parent caller is gated on the target student's status, not their own", async () => {
    const holdError = new ApiError(403, 'Account access is on hold pending guardian action');
    (assertAccountStatusAllowsAccess as any).mockRejectedValue(holdError);
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
    });

    await expect(assertSessionAccessAllowed(PARENT_ID, 'PARENT', SESSION_ID)).rejects.toMatchObject(
      {
        statusCode: 403,
        message: 'Account access is on hold pending guardian action',
      },
    );
  });

  it('a Tutor caller is never gated by the guardian-hold check — assertAccountStatusAllowsAccess is asserted not called', async () => {
    (assertAccountStatusAllowsAccess as any).mockImplementation(() => {
      throw new Error('should not be called for a TUTOR caller');
    });
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
    });
    (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: TUTOR_ID });

    const result = await assertSessionAccessAllowed(TUTOR_ID, 'TUTOR', SESSION_ID);

    expect(result.id).toBe(SESSION_ID);
    expect(assertAccountStatusAllowsAccess).not.toHaveBeenCalled();
  });

  it('an Admin caller is never gated by the guardian-hold check', async () => {
    (assertAccountStatusAllowsAccess as any).mockImplementation(() => {
      throw new Error('should not be called for an ADMIN caller');
    });
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
    });

    const result = await assertSessionAccessAllowed(ADMIN_ID, 'ADMIN', SESSION_ID);

    expect(result.id).toBe(SESSION_ID);
    expect(assertAccountStatusAllowsAccess).not.toHaveBeenCalled();
  });

  it('caller with no relation to the cohort at all rejected (IDOR), independent of hold status', async () => {
    (assertAccountStatusAllowsAccess as any).mockResolvedValue(undefined);
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
    });
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(null);

    await expect(
      assertSessionAccessAllowed(STUDENT_ID, 'STUDENT', SESSION_ID),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to view this session',
    });
  });

  it('non-existent sessionId throws ApiError(404, ...)', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue(null);

    await expect(
      assertSessionAccessAllowed(STUDENT_ID, 'STUDENT', 'a-uuid-that-does-not-exist'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe.skip('markCompleted', () => {
  beforeEach(resetMocks);

  it('marks a SCHEDULED session completed', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      tutorId: TUTOR_ID,
      status: 'SCHEDULED',
    });
    (prisma.scheduledSession.update as any).mockResolvedValue({
      id: SESSION_ID,
      status: 'COMPLETED',
    });

    const result = await markCompleted(TUTOR_ID, SESSION_ID);

    expect(result).toEqual({ id: SESSION_ID, status: 'COMPLETED' });
  });

  it.each(['COMPLETED', 'MISSED', 'CANCELLED'])(
    'rejects an already-%s session with ApiError(409, "This session\'s status cannot be changed")',
    async (status) => {
      (prisma.scheduledSession.findUnique as any).mockResolvedValue({
        id: SESSION_ID,
        tutorId: TUTOR_ID,
        status,
      });

      await expect(markCompleted(TUTOR_ID, SESSION_ID)).rejects.toMatchObject({
        statusCode: 409,
        message: "This session's status cannot be changed",
      });
    },
  );
});

describe.skip('listMySessions / getSession (co-located reads)', () => {
  beforeEach(resetMocks);

  it('no sessions yet resolves { sessions: [] }, not an error', async () => {
    (prisma.cohortMembership.findMany as any).mockResolvedValue([]);
    (prisma.scheduledSession.findMany as any).mockResolvedValue([]);

    const { listMySessions } = await import('../../src/services/session.service.js');
    const result = await listMySessions(STUDENT_ID, 'STUDENT');

    expect(result.sessions).toEqual([]);
  });

  it('getSession — non-member rejected (IDOR) with ApiError(403, "Not authorized to view this session")', async () => {
    (assertAccountStatusAllowsAccess as any).mockResolvedValue(undefined);
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
    });
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(null);

    const { getSession } = await import('../../src/services/session.service.js');

    await expect(getSession(STUDENT_ID, 'STUDENT', SESSION_ID)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to view this session',
    });
  });

  it('getSession reports PAYMENT_PAUSE_RESCHEDULED verbatim — this endpoint only reports it, never sets it', async () => {
    (assertAccountStatusAllowsAccess as any).mockResolvedValue(undefined);
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      status: 'PAYMENT_PAUSE_RESCHEDULED',
    });
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({
      id: 'membership-1',
      cohortId: COHORT_ID,
      studentId: STUDENT_ID,
    });

    const { getSession } = await import('../../src/services/session.service.js');
    const result = await getSession(STUDENT_ID, 'STUDENT', SESSION_ID);

    expect(result.status).toBe('PAYMENT_PAUSE_RESCHEDULED');
  });

  it("listMySessions is scoped strictly to the caller's own cohorts — the query filter never returns another caller's sessions", async () => {
    (prisma.cohortMembership.findMany as any).mockResolvedValue([{ cohortId: COHORT_ID }]);
    (prisma.scheduledSession.findMany as any).mockResolvedValue([
      { id: SESSION_ID, cohortId: COHORT_ID },
    ]);

    const { listMySessions } = await import('../../src/services/session.service.js');
    await listMySessions(STUDENT_ID, 'STUDENT');

    const findManyArg = (prisma.scheduledSession.findMany as any).mock.calls[0][0];
    expect(JSON.stringify(findManyArg)).toContain(COHORT_ID);
  });
});
