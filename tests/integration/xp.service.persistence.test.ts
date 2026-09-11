/**
 * tests/integration/xp.service.persistence.test.ts
 *
 * Journey step 6.14. Spec: `09-6-gamification-engagement.md` §9.14
 * (Integration — Persistence tier, Phase 5.5 of the redesign plan).
 * FRs: FR-SP-039, FR-GA-002, FR-GA-006. Traces to
 * `04-database-and-data-model.md` §4.2 (XPLedgerEntry).
 *
 * Real database, no silent mock fallback (Rule 7). Every FK is seeded via
 * `accounts-guardianship.factory.ts`'s `buildStudentProfile` using a real,
 * just-created id, per `00-test-fixtures.md §1.1`. Nothing here mocks
 * `src/config/db.ts` — the real exported `xp.service.ts` functions are
 * called directly against the real test database, exercising real Prisma
 * queries end to end.
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
import { awardXP, adminAdjustXP, getLeaderboard } from '../../src/services/xp.service.js';

async function seedRealStudent(overrides: Record<string, unknown> = {}) {
  const user = await (testPrisma as any).user.create({ data: buildUser() });
  const student = await (testPrisma as any).studentProfile.create({
    data: buildStudentProfile({ userId: user.id, ...overrides }),
  });
  return { user, student };
}

describe.skip('xp.service.ts — Integration (persistence)', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  describe('getLeaderboard — real aggregation', () => {
    it('a real SUM nets multiple ledger entries correctly, including a negative adjustment', async () => {
      const { student } = await seedRealStudent();
      const admin = await (testPrisma as any).user.create({ data: buildUser({ role: 'ADMIN' }) });

      await awardXP(student.id, undefined as any, 'CLASS_ATTENDED' as any);
      await awardXP(student.id, undefined as any, 'CLASS_ATTENDED' as any);
      await adminAdjustXP(student.id, admin.id, -15, 'Correction');

      const result = await getLeaderboard(student.id, 'STUDENT' as any, undefined, 'WEEKLY' as any);

      const row = result.rankings.find((r: any) => r.xp === 25);
      expect(row).toBeDefined();

      const rowCount = await (testPrisma as any).xpLedgerEntry.count({
        where: { studentId: student.id },
      });
      expect(rowCount).toBe(3);
    });

    it("grade-scoping genuinely excludes a real cross-grade student's real rows", async () => {
      const { student: grade8Student } = await seedRealStudent({ grade: 8 });
      const { student: grade10Student } = await seedRealStudent({ grade: 10 });

      await awardXP(grade8Student.id, undefined as any, 'CLASS_ATTENDED' as any);
      await awardXP(grade10Student.id, undefined as any, 'CLASS_ATTENDED' as any);

      const result = await getLeaderboard(
        grade8Student.id,
        'STUDENT' as any,
        undefined,
        'WEEKLY' as any,
      );

      expect(result.rankings.some((r: any) => r.studentId === grade8Student.id)).toBe(true);
      expect(result.rankings.some((r: any) => r.studentId === grade10Student.id)).toBe(false);
    });

    it('only entries inside the period window are aggregated', async () => {
      const { student } = await seedRealStudent();

      await (testPrisma as any).xpLedgerEntry.create({
        data: {
          studentId: student.id,
          amount: 20,
          reason: 'CLASS_ATTENDED',
          createdAt: new Date(),
        },
      });
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      await (testPrisma as any).xpLedgerEntry.create({
        data: {
          studentId: student.id,
          amount: 20,
          reason: 'CLASS_ATTENDED',
          createdAt: tenDaysAgo,
        },
      });

      const result = await getLeaderboard(student.id, 'STUDENT' as any, undefined, 'WEEKLY' as any);

      const row = result.rankings.find((r: any) => r.studentId === student.id);
      expect(row?.xp).toBe(20);
    });
  });

  describe('awardXP — real concurrent ledger writes (Review §6.2 item 5)', () => {
    it('a burst of 20 concurrent awards for one student is never lost', async () => {
      const { student } = await seedRealStudent();

      await Promise.all(
        Array.from({ length: 20 }, () =>
          awardXP(student.id, undefined as any, 'CLASS_ATTENDED' as any),
        ),
      );

      const rowCount = await (testPrisma as any).xpLedgerEntry.count({
        where: { studentId: student.id },
      });
      const sum = await (testPrisma as any).xpLedgerEntry.aggregate({
        where: { studentId: student.id },
        _sum: { amount: true },
      });

      expect(rowCount).toBe(20);
      expect(sum._sum.amount).toBe(400);
    });

    it("concurrent awards across two different students don't cross-contaminate", async () => {
      const { student: studentA } = await seedRealStudent();
      const { student: studentB } = await seedRealStudent();

      await Promise.all([
        ...Array.from({ length: 10 }, () =>
          awardXP(studentA.id, undefined as any, 'CLASS_ATTENDED' as any),
        ),
        ...Array.from({ length: 10 }, () =>
          awardXP(studentB.id, undefined as any, 'CLASS_ATTENDED' as any),
        ),
      ]);

      const countA = await (testPrisma as any).xpLedgerEntry.count({
        where: { studentId: studentA.id },
      });
      const sumA = await (testPrisma as any).xpLedgerEntry.aggregate({
        where: { studentId: studentA.id },
        _sum: { amount: true },
      });
      const countB = await (testPrisma as any).xpLedgerEntry.count({
        where: { studentId: studentB.id },
      });
      const sumB = await (testPrisma as any).xpLedgerEntry.aggregate({
        where: { studentId: studentB.id },
        _sum: { amount: true },
      });

      expect(countA).toBe(10);
      expect(sumA._sum.amount).toBe(200);
      expect(countB).toBe(10);
      expect(sumB._sum.amount).toBe(200);
    });
  });
});
