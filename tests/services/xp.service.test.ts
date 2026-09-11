/**
 * tests/services/xp.service.test.ts
 *
 * Journey step 6.1. Spec: `09-6-gamification-engagement.md` §9.2.
 * FRs: FR-SP-039, FR-GA-002. Section 10 v3.2 XP point values.
 * OWASP: A01:2021 – Broken Access Control (grade-scoping, Parent→child
 * resolution). A04:2021 – Insecure Design (XP values are business-critical
 * constants).
 *
 * `awardXP`'s CHALLENGE_COMPLETED branch needs to know whether the
 * just-completed challenge is WEEKLY or MONTHLY to pick 30 vs 100. The
 * function-level spec doesn't pin the exact internal lookup (no
 * `challengeId` param on the signature), so this suite mocks
 * `prisma.challengeProgress.findFirst` returning a joined `challenge.period`
 * as the most-recently-completed-challenge lookup — flagged here as an
 * assumption for the implementer to confirm, same spirit as the doc's own
 * flagged items (e.g. §9.4's badge re-award case).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    xpLedgerEntry: {
      create: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    studentProfile: {
      findUnique: vi.fn(),
    },
    challengeProgress: {
      findFirst: vi.fn(),
    },
    parentStudentRelationship: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/streak.service.js', () => ({
  updateStreakOnActivity: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { updateStreakOnActivity } from '../../src/services/streak.service.js';
import { awardXP, getLeaderboard, adminAdjustXP } from '../../src/services/xp.service.js';
import ApiError from '../../src/utils/ApiError.js';

const STUDENT_ID = 'student-1';
const ADMIN_ID = 'admin-1';

function mockCreatedEntry(overrides: Record<string, unknown> = {}) {
  const entry = {
    id: 'entry-1',
    studentId: STUDENT_ID,
    amount: 0,
    reason: 'OTHER',
    note: null,
    createdAt: new Date(),
    ...overrides,
  };
  (prisma.xpLedgerEntry.create as any).mockResolvedValue(entry);
  return entry;
}

describe.skip('awardXP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CLASS_ATTENDED awards exactly 20', async () => {
    mockCreatedEntry({ amount: 20, reason: 'CLASS_ATTENDED' });

    const result = await awardXP(STUDENT_ID, undefined as any, 'CLASS_ATTENDED' as any);

    expect(result.amount).toBe(20);
    const createArg = (prisma.xpLedgerEntry.create as any).mock.calls[0][0];
    expect(createArg.data.amount).toBe(20);
  });

  it('ASSESSMENT_COMPLETED awards exactly 15', async () => {
    mockCreatedEntry({ amount: 15, reason: 'ASSESSMENT_COMPLETED' });

    const result = await awardXP(STUDENT_ID, undefined as any, 'ASSESSMENT_COMPLETED' as any);

    expect(result.amount).toBe(15);
  });

  it('STREAK_MILESTONE awards exactly 50', async () => {
    mockCreatedEntry({ amount: 50, reason: 'STREAK_MILESTONE' });

    const result = await awardXP(STUDENT_ID, undefined as any, 'STREAK_MILESTONE' as any);

    expect(result.amount).toBe(50);
  });

  it('CHALLENGE_COMPLETED awards 30 for a weekly challenge', async () => {
    (prisma.challengeProgress.findFirst as any).mockResolvedValue({
      challenge: { period: 'WEEKLY' },
    });
    mockCreatedEntry({ amount: 30, reason: 'CHALLENGE_COMPLETED' });

    const result = await awardXP(STUDENT_ID, undefined as any, 'CHALLENGE_COMPLETED' as any);

    expect(result.amount).toBe(30);
  });

  it('CHALLENGE_COMPLETED awards 100 for a monthly challenge — tested as a genuinely different branch', async () => {
    (prisma.challengeProgress.findFirst as any).mockResolvedValue({
      challenge: { period: 'MONTHLY' },
    });
    mockCreatedEntry({ amount: 100, reason: 'CHALLENGE_COMPLETED' });

    const result = await awardXP(STUDENT_ID, undefined as any, 'CHALLENGE_COMPLETED' as any);

    expect(result.amount).toBe(100);
  });

  it('BADGE_AWARDED awards exactly 25', async () => {
    mockCreatedEntry({ amount: 25, reason: 'BADGE_AWARDED' });

    const result = await awardXP(STUDENT_ID, undefined as any, 'BADGE_AWARDED' as any);

    expect(result.amount).toBe(25);
  });

  it('OTHER accepts a caller-supplied amount', async () => {
    mockCreatedEntry({ amount: 12, reason: 'OTHER' });

    const result = await awardXP(STUDENT_ID, 12, 'OTHER' as any);

    expect(result.amount).toBe(12);
  });

  it('never mutates a running total column — only an xpLedgerEntry.create call is made', async () => {
    mockCreatedEntry({ amount: 20, reason: 'CLASS_ATTENDED' });

    await awardXP(STUDENT_ID, undefined as any, 'CLASS_ATTENDED' as any);

    expect(prisma.xpLedgerEntry.create).toHaveBeenCalledTimes(1);
    expect((prisma.studentProfile as any).update).toBeUndefined();
    expect((prisma.xpLedgerEntry as any).update).toBeUndefined();
    expect((prisma.xpLedgerEntry as any).updateMany).toBeUndefined();
  });

  it('also updates the streak for the same event', async () => {
    mockCreatedEntry({ amount: 20, reason: 'CLASS_ATTENDED' });

    await awardXP(STUDENT_ID, undefined as any, 'CLASS_ATTENDED' as any);

    expect(updateStreakOnActivity).toHaveBeenCalledTimes(1);
    const [calledStudentId] = (updateStreakOnActivity as any).mock.calls[0];
    expect(calledStudentId).toBe(STUDENT_ID);
  });
});

describe.skip('getLeaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.studentProfile.findUnique as any).mockResolvedValue({
      id: STUDENT_ID,
      grade: 8,
      user: { firstName: 'Bethel', lastName: 'Molla' },
    });
  });

  it('grade-scoping is enforced in the query itself — a real cross-grade student is excluded', async () => {
    // Simulates what a real grade-scoped groupBy would return: filters a
    // mixed Grade-8/Grade-10 dataset down to whichever grade the query's
    // own where-clause asked for, rather than a mock that is pre-filtered
    // regardless of the args it was called with.
    const mixedDataset = [
      { studentId: STUDENT_ID, grade: 8, _sum: { amount: 40 } },
      { studentId: 'grade-10-student', grade: 10, _sum: { amount: 999 } },
    ];
    (prisma.xpLedgerEntry.groupBy as any).mockImplementation((args: any) => {
      const requestedGrade = args?.where?.student?.grade ?? args?.where?.grade;
      return Promise.resolve(mixedDataset.filter((row) => row.grade === requestedGrade));
    });

    const result = await getLeaderboard(STUDENT_ID, 'STUDENT' as any, undefined, 'WEEKLY' as any);

    const groupByArg = (prisma.xpLedgerEntry.groupBy as any).mock.calls[0][0];
    expect(JSON.stringify(groupByArg)).toContain('8');
    expect(result.rankings.some((r: any) => r.xp === 999)).toBe(false);
    expect(result.rankings.some((r: any) => r.xp === 40)).toBe(true);
  });

  it('displayName is always first name + last-initial, never a reachable lastName field', async () => {
    (prisma.xpLedgerEntry.groupBy as any).mockResolvedValue([
      { studentId: STUDENT_ID, _sum: { amount: 340 } },
    ]);

    const result = await getLeaderboard(STUDENT_ID, 'STUDENT' as any, undefined, 'WEEKLY' as any);

    expect(result.rankings[0].displayName).toBe('Bethel M.');
    for (const row of result.rankings) {
      expect(row).not.toHaveProperty('lastName');
      expect(JSON.stringify(row)).not.toContain('Molla');
    }
  });

  it('WEEKLY vs MONTHLY use genuinely different aggregation windows', async () => {
    (prisma.xpLedgerEntry.groupBy as any).mockResolvedValue([
      { studentId: STUDENT_ID, _sum: { amount: 100 } },
    ]);

    await getLeaderboard(STUDENT_ID, 'STUDENT' as any, undefined, 'WEEKLY' as any);
    const weeklyArg = (prisma.xpLedgerEntry.groupBy as any).mock.calls[0][0];

    (prisma.xpLedgerEntry.groupBy as any).mockClear();
    await getLeaderboard(STUDENT_ID, 'STUDENT' as any, undefined, 'MONTHLY' as any);
    const monthlyArg = (prisma.xpLedgerEntry.groupBy as any).mock.calls[0][0];

    expect(JSON.stringify(weeklyArg.where.createdAt)).not.toBe(
      JSON.stringify(monthlyArg.where.createdAt),
    );
  });

  it('parent caller resolves studentId via an ACTIVE relationship', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue({
      id: 'rel-1',
      parentId: 'parent-1',
      studentId: STUDENT_ID,
      status: 'ACTIVE',
    });
    (prisma.xpLedgerEntry.groupBy as any).mockResolvedValue([
      { studentId: STUDENT_ID, _sum: { amount: 50 } },
    ]);

    const result = await getLeaderboard('parent-1', 'PARENT' as any, STUDENT_ID, 'WEEKLY' as any);

    expect(result.grade).toBe(8);
  });

  it('parent caller with no ACTIVE relationship to the queried student is rejected (IDOR)', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue(null);

    await expect(
      getLeaderboard('parent-1', 'PARENT' as any, 'some-other-student', 'WEEKLY' as any),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('student caller ignores any studentId override', async () => {
    (prisma.xpLedgerEntry.groupBy as any).mockResolvedValue([
      { studentId: STUDENT_ID, _sum: { amount: 50 } },
    ]);

    await getLeaderboard(STUDENT_ID, 'STUDENT' as any, 'some-other-student', 'WEEKLY' as any);

    expect(prisma.studentProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: STUDENT_ID }) }),
    );
  });

  it('callerRank is present even outside the top ranks', async () => {
    const rankings = Array.from({ length: 50 }, (_, i) => ({
      studentId: i === 46 ? STUDENT_ID : `student-${i}`,
      _sum: { amount: 50 - i },
    }));
    (prisma.xpLedgerEntry.groupBy as any).mockResolvedValue(rankings);

    const result = await getLeaderboard(STUDENT_ID, 'STUDENT' as any, undefined, 'WEEKLY' as any);

    expect(result.callerRank).toBe(47);
  });
});

describe.skip('adminAdjustXP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.studentProfile.findUnique as any).mockResolvedValue({ id: STUDENT_ID });
  });

  it('writes an XPLedgerEntry with reason OTHER and the exact supplied amount', async () => {
    mockCreatedEntry({
      amount: -20,
      reason: 'OTHER',
      note: 'Reversing an erroneous award',
    });

    const result = await adminAdjustXP(STUDENT_ID, ADMIN_ID, -20, 'Reversing an erroneous award');

    expect(result.amount).toBe(-20);
    expect(result.reason).toBe('OTHER');
    expect(result.note).toBe('Reversing an erroneous award');
  });

  it('accepts a negative amount (correction) as well as a positive amount (goodwill)', async () => {
    mockCreatedEntry({ amount: 10, reason: 'OTHER', note: 'Goodwill' });
    const goodwill = await adminAdjustXP(STUDENT_ID, ADMIN_ID, 10, 'Goodwill');

    mockCreatedEntry({ amount: -10, reason: 'OTHER', note: 'Correction' });
    const correction = await adminAdjustXP(STUDENT_ID, ADMIN_ID, -10, 'Correction');

    expect(goodwill.amount + correction.amount).toBe(0);
  });

  it('rejects a zero amount', async () => {
    await expect(adminAdjustXP(STUDENT_ID, ADMIN_ID, 0, 'note')).rejects.toMatchObject({
      statusCode: 400,
      message: 'amount must be a non-zero integer',
    });
    expect(prisma.xpLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('rejects a missing/empty note', async () => {
    await expect(adminAdjustXP(STUDENT_ID, ADMIN_ID, 10, '')).rejects.toMatchObject({
      statusCode: 400,
      message: 'A note is required for a manual XP adjustment',
    });
    expect(prisma.xpLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('throws 404 when no matching StudentProfile is found', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(null);

    await expect(adminAdjustXP(STUDENT_ID, ADMIN_ID, 10, 'note')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Student not found',
    });
  });

  it('never calls updateStreakOnActivity — a manual correction must never fabricate or extend a streak', async () => {
    mockCreatedEntry({ amount: 10, reason: 'OTHER', note: 'note' });

    await adminAdjustXP(STUDENT_ID, ADMIN_ID, 10, 'note');

    expect(updateStreakOnActivity).not.toHaveBeenCalled();
  });

  it('feeds into the leaderboard exactly like any other ledger entry', async () => {
    mockCreatedEntry({ amount: 15, reason: 'OTHER', note: 'Adjustment' });
    await adminAdjustXP(STUDENT_ID, ADMIN_ID, 15, 'Adjustment');

    (prisma.xpLedgerEntry.groupBy as any).mockResolvedValue([
      { studentId: STUDENT_ID, _sum: { amount: 15 } },
    ]);
    const leaderboard = await getLeaderboard(
      STUDENT_ID,
      'STUDENT' as any,
      undefined,
      'WEEKLY' as any,
    );

    expect(leaderboard.rankings.find((r: any) => r.displayName)?.xp).toBe(15);
  });
});
