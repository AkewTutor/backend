/**
 * tests/services/streak.service.test.ts
 *
 * Journey step 6.9. Spec: `09-6-gamification-engagement.md` §9.6.
 * FRs: FR-GA-003, FR-GA-006. Section 10 v3.2 streak milestones (7/30/90).
 * OWASP: none specific (internal-only) — milestone/date-math correctness is
 * treated with the same rigor as reschedule/escalation window tests.
 *
 * Whichever caller wires a milestone crossing into
 * `xp.service.awardXP('STREAK_MILESTONE')` / `badge.service.awardStudentBadge`
 * is flagged for the implementer to confirm (§9.6) — this suite asserts the
 * milestone is flagged/returned by `streak.service.ts` itself (e.g. a
 * `milestoneReached` field on the resolved DTO), not that it directly calls
 * those other services.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    streak: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/badge.service.js', () => ({
  awardStudentBadge: vi.fn(),
}));

vi.mock('../../src/services/xp.service.js', () => ({
  awardXP: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import * as badgeService from '../../src/services/badge.service.js';
import * as xpService from '../../src/services/xp.service.js';
import { updateStreakOnActivity, resetStreakOnGap } from '../../src/services/streak.service.js';

const STUDENT_ID = 'student-1';

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function mockExistingStreak(overrides: Record<string, unknown>) {
  (prisma.streak.findUnique as any).mockResolvedValue({
    id: 'streak-1',
    studentId: STUDENT_ID,
    currentStreakDays: 0,
    longestStreakDays: 0,
    lastActivityDate: null,
    ...overrides,
  });
}

describe.skip('updateStreakOnActivity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a consecutive day increments the streak', async () => {
    mockExistingStreak({
      lastActivityDate: daysAgo(1),
      currentStreakDays: 4,
      longestStreakDays: 12,
    });
    (prisma.streak.upsert as any).mockImplementation((args: any) =>
      Promise.resolve({ studentId: STUDENT_ID, ...args.update }),
    );

    const result = await updateStreakOnActivity(STUDENT_ID, new Date().toISOString());

    expect(result.currentStreakDays).toBe(5);
  });

  it('a non-consecutive day resets to 1', async () => {
    mockExistingStreak({
      lastActivityDate: daysAgo(3),
      currentStreakDays: 4,
      longestStreakDays: 12,
    });
    (prisma.streak.upsert as any).mockImplementation((args: any) =>
      Promise.resolve({ studentId: STUDENT_ID, ...args.update }),
    );

    const result = await updateStreakOnActivity(STUDENT_ID, new Date().toISOString());

    expect(result.currentStreakDays).toBe(1);
  });

  it('longestStreakDays remains unchanged when not exceeded', async () => {
    mockExistingStreak({
      lastActivityDate: daysAgo(1),
      currentStreakDays: 4,
      longestStreakDays: 12,
    });
    (prisma.streak.upsert as any).mockImplementation((args: any) =>
      Promise.resolve({ studentId: STUDENT_ID, ...args.update }),
    );

    const result = await updateStreakOnActivity(STUDENT_ID, new Date().toISOString());

    expect(result.currentStreakDays).toBe(5);
    expect(result.longestStreakDays).toBe(12);
  });

  it('longestStreakDays updates when the new current exceeds it', async () => {
    mockExistingStreak({
      lastActivityDate: daysAgo(1),
      currentStreakDays: 12,
      longestStreakDays: 12,
    });
    (prisma.streak.upsert as any).mockImplementation((args: any) =>
      Promise.resolve({ studentId: STUDENT_ID, ...args.update }),
    );

    const result = await updateStreakOnActivity(STUDENT_ID, new Date().toISOString());

    expect(result.currentStreakDays).toBe(13);
    expect(result.longestStreakDays).toBe(13);
  });

  it('longestStreakDays never decreases across a reset-then-partial-rebuild sequence', async () => {
    // Prior streak reached longestStreakDays: 30.
    mockExistingStreak({
      lastActivityDate: daysAgo(1),
      currentStreakDays: 29,
      longestStreakDays: 30,
    });
    (prisma.streak.upsert as any).mockImplementation((args: any) =>
      Promise.resolve({ studentId: STUDENT_ID, ...args.update }),
    );
    const peak = await updateStreakOnActivity(STUDENT_ID, new Date().toISOString());
    expect(peak.currentStreakDays).toBe(30);
    expect(peak.longestStreakDays).toBe(30);

    // A gap resets currentStreakDays to 1, longestStreakDays must stay 30.
    mockExistingStreak({
      lastActivityDate: daysAgo(5),
      currentStreakDays: 30,
      longestStreakDays: 30,
    });
    const afterGap = await updateStreakOnActivity(STUDENT_ID, new Date().toISOString());
    expect(afterGap.currentStreakDays).toBe(1);
    expect(afterGap.longestStreakDays).toBe(30);

    // Partial rebuild to 10 — still well below the old peak.
    mockExistingStreak({
      lastActivityDate: daysAgo(1),
      currentStreakDays: 9,
      longestStreakDays: 30,
    });
    const rebuilding = await updateStreakOnActivity(STUDENT_ID, new Date().toISOString());
    expect(rebuilding.currentStreakDays).toBe(10);
    expect(rebuilding.longestStreakDays).toBe(30);
  });

  it('a milestone at exactly 7/30/90 is the trigger point', async () => {
    for (const [priorDays, expectedMilestone] of [
      [6, 7],
      [29, 30],
      [89, 90],
    ] as const) {
      mockExistingStreak({
        lastActivityDate: daysAgo(1),
        currentStreakDays: priorDays,
        longestStreakDays: priorDays,
      });
      (prisma.streak.upsert as any).mockImplementation((args: any) =>
        Promise.resolve({ studentId: STUDENT_ID, ...args.update }),
      );

      const result = await updateStreakOnActivity(STUDENT_ID, new Date().toISOString());

      expect(result.currentStreakDays).toBe(expectedMilestone);
      expect((result as any).milestoneReached).toBe(expectedMilestone);
    }
  });

  it('a milestone does not re-fire mid-streak', async () => {
    mockExistingStreak({
      lastActivityDate: daysAgo(1),
      currentStreakDays: 10,
      longestStreakDays: 10,
    });
    (prisma.streak.upsert as any).mockImplementation((args: any) =>
      Promise.resolve({ studentId: STUDENT_ID, ...args.update }),
    );

    const result = await updateStreakOnActivity(STUDENT_ID, new Date().toISOString());

    expect(result.currentStreakDays).toBe(11);
    expect((result as any).milestoneReached).toBeFalsy();
  });
});

describe.skip('resetStreakOnGap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resets currentStreakDays without touching badges/XP', async () => {
    mockExistingStreak({
      lastActivityDate: daysAgo(2),
      currentStreakDays: 8,
      longestStreakDays: 12,
    });
    (prisma.streak.update as any).mockImplementation((args: any) =>
      Promise.resolve({ studentId: STUDENT_ID, ...args.data }),
    );

    const result = await resetStreakOnGap(STUDENT_ID);

    expect(result.currentStreakDays).toBe(0);
    expect(badgeService.awardStudentBadge).not.toHaveBeenCalled();
    expect(xpService.awardXP).not.toHaveBeenCalled();
  });

  it('longestStreakDays is preserved across the reset', async () => {
    mockExistingStreak({
      lastActivityDate: daysAgo(2),
      currentStreakDays: 8,
      longestStreakDays: 30,
    });
    (prisma.streak.update as any).mockImplementation((args: any) =>
      Promise.resolve({ studentId: STUDENT_ID, longestStreakDays: 30, ...args.data }),
    );

    const result = await resetStreakOnGap(STUDENT_ID);

    expect(result.longestStreakDays).toBe(30);
  });
});
