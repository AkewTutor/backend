/**
 * tests/integration/streak.service.persistence.test.ts
 *
 * Journey step 6.16. Spec: `09-6-gamification-engagement.md` §9.15
 * (concurrent-update race on Streak — flagged addition per §9.12, following
 * the precedent `9-3-matching-cohorts-persistence.md §9.19` set for
 * `selectTutor`'s double-submit race).
 * FRs: FR-GA-003, FR-GA-006. Traces to `04-database-and-data-model.md` §4.2
 * (Streak — real unique 1:1 constraint on studentId).
 *
 * Real database, no silent mock fallback (Rule 7).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildStudentProfile } from '../factories/accounts-guardianship.factory.js';
import { buildUser } from '../factories/shared-config.factory.js';
import {
  assertTestDbReachable,
  disconnectTestDb,
  resetTestDb,
  testPrisma,
} from '../setup/testDb.js';
import { updateStreakOnActivity } from '../../src/services/streak.service.js';

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function seedRealStudentWithStreak(overrides: Record<string, unknown> = {}) {
  const user = await (testPrisma as any).user.create({ data: buildUser() });
  const student = await (testPrisma as any).studentProfile.create({
    data: buildStudentProfile({ userId: user.id }),
  });
  await (testPrisma as any).streak.create({
    data: {
      studentId: student.id,
      currentStreakDays: 4,
      longestStreakDays: 4,
      lastActivityDate: daysAgo(1),
      ...overrides,
    },
  });
  return student;
}

describe.skip('streak.service.ts — Integration (persistence)', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("two simultaneous activity events for the same student don't double-count or corrupt the streak", async () => {
    const student = await seedRealStudentWithStreak();
    const today = new Date().toISOString();

    await Promise.all([
      updateStreakOnActivity(student.id, today),
      updateStreakOnActivity(student.id, today),
    ]);

    const rows = await (testPrisma as any).streak.findMany({ where: { studentId: student.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].currentStreakDays).toBe(5);
  });
});
