/**
 * tests/integration/guardianship.service.persistence.test.ts
 *
 * Journey step 2.26. Spec: `9-2-accounts-guardianship-persistence.md` §9.23.
 * Sibling of `09-2-accounts-guardianship.md` (Unit + Integration (HTTP
 * contract) tiers live there).
 * FRs: FR-AC-002–008. Traces to `04-database-and-data-model.md` §4.2
 * (StudentProfile, ParentStudentRelationship).
 *
 * Nothing in this file mocks `src/config/db.ts` — `guardianship.service.ts`'s
 * own `prisma` import reads the identical `DATABASE_URL` this suite's
 * `tests/setup/env.setup.ts` loads from `.env.test`, so calling the real
 * exported service functions below exercises the real test database
 * directly, per Rule 3 of the test environment convention in the spec doc.
 * `testPrisma` (a second client on the same physical database) is used
 * only for out-of-band seeding/verification queries.
 *
 * Cross-module fixtures: `matching-cohorts.factory.ts` (Cohort,
 * CohortMembership) and `gamification-engagement.factory.ts`
 * (XPLedgerEntry, Streak) are seeded here to prove the sole-guardian
 * removal path's "no row deleted or orphaned" guarantee against real,
 * cross-feature rows — per `00-test-fixtures.md §1.1` and this spec's own
 * "cross-module fixture usage" convention note.
 */

import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildUser } from '../factories/shared-config.factory.js';
import {
  buildParentProfile,
  buildParentStudentRelationship,
  buildStudentProfile,
  buildTutorProfile,
} from '../factories/accounts-guardianship.factory.js';
import { buildCohort, buildCohortMembership } from '../factories/matching-cohorts.factory.js';
import { buildStreak, buildXPLedgerEntry } from '../factories/gamification-engagement.factory.js';
import {
  assertTestDbReachable,
  disconnectTestDb,
  resetTestDb,
  testPrisma,
} from '../setup/testDb.js';
import {
  activateInvite,
  assertAccountStatusAllowsAccess,
  revokeOrModifyRelationship,
} from '../../src/services/guardianship.service.js';

/** Seeds a real linked parent + student pair with an INVITED relationship, returns all three ids. */
async function seedInvitedFamily(overrides: { inviteExpiresAt?: Date } = {}) {
  const parentUser = await (testPrisma as any).user.create({ data: buildUser({ role: 'PARENT' }) });
  const parentProfile = await (testPrisma as any).parentProfile.create({
    data: buildParentProfile({ userId: parentUser.id }),
  });
  const studentUser = await (testPrisma as any).user.create({
    data: buildUser({ role: 'STUDENT' }),
  });
  const studentProfile = await (testPrisma as any).studentProfile.create({
    data: buildStudentProfile({
      userId: studentUser.id,
      grade: 3,
      accountStatus: 'PENDING_ACTIVATION',
    }),
  });
  const relationship = await (testPrisma as any).parentStudentRelationship.create({
    data: buildParentStudentRelationship({
      parentId: parentProfile.id,
      studentId: studentProfile.id,
      status: 'INVITED',
      inviteExpiresAt: overrides.inviteExpiresAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    }),
  });
  return { parentUser, parentProfile, studentProfile, relationship };
}

/** Seeds a real, ACTIVE sole-mandatory-guardian relationship. */
async function seedSoleGuardianFamily() {
  const parentUser = await (testPrisma as any).user.create({ data: buildUser({ role: 'PARENT' }) });
  const parentProfile = await (testPrisma as any).parentProfile.create({
    data: buildParentProfile({ userId: parentUser.id }),
  });
  const studentUser = await (testPrisma as any).user.create({
    data: buildUser({ role: 'STUDENT' }),
  });
  const studentProfile = await (testPrisma as any).studentProfile.create({
    data: buildStudentProfile({ userId: studentUser.id, grade: 3, accountStatus: 'ACTIVE' }),
  });
  const relationship = await (testPrisma as any).parentStudentRelationship.create({
    data: buildParentStudentRelationship({
      parentId: parentProfile.id,
      studentId: studentProfile.id,
      relationshipType: 'MANDATORY_GUARDIAN',
      status: 'ACTIVE',
    }),
  });
  return { parentUser, parentProfile, studentProfile, relationship };
}

describe('guardianship.service.ts — Integration (persistence)', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  describe('activateInvite — real uniqueness and real double-fire guard', () => {
    it('the inviteToken unique constraint is real', async () => {
      const { relationship } = await seedInvitedFamily();

      let caught: any;
      try {
        await (testPrisma as any).parentStudentRelationship.create({
          data: buildParentStudentRelationship({
            parentId: relationship.parentId,
            studentId: relationship.studentId,
            inviteToken: relationship.inviteToken,
          }),
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      expect(caught.code).toBe('P2002');
    });

    it('the (parentId, studentId) unique composite is real', async () => {
      const { relationship } = await seedInvitedFamily();

      let caught: any;
      try {
        await (testPrisma as any).parentStudentRelationship.create({
          data: buildParentStudentRelationship({
            parentId: relationship.parentId,
            studentId: relationship.studentId,
          }),
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      expect(caught.code).toBe('P2002');
    });

    it('two near-simultaneous activation attempts on the same valid token create exactly one real User/StudentProfile pair', async () => {
      const { relationship } = await seedInvitedFamily();

      const results = await Promise.allSettled([
        activateInvite(relationship.inviteToken, 'password123'),
        activateInvite(relationship.inviteToken, 'password123'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const users = await (testPrisma as any).user.findMany({
        where: { studentProfile: { id: relationship.studentId } },
      });
      expect(users).toHaveLength(1);

      const freshRelationship = await (testPrisma as any).parentStudentRelationship.findUnique({
        where: { id: relationship.id },
      });
      expect(freshRelationship.status).toBe('ACTIVE');
    });
  });

  describe('revokeOrModifyRelationship / handleSoleGuardianRemoval — real state transition and real no-cascade proof', () => {
    it('sole-guardian removal persists GUARDIAN_REQUIRED_HOLD for real', async () => {
      const { parentUser, studentProfile, relationship } = await seedSoleGuardianFamily();

      await revokeOrModifyRelationship(parentUser.id, 'PARENT', relationship.id, {
        revoke: true,
      } as any);

      const freshStudent = await (testPrisma as any).studentProfile.findUnique({
        where: { id: studentProfile.id },
      });
      expect(freshStudent.accountStatus).toBe('GUARDIAN_REQUIRED_HOLD');

      const freshRelationship = await (testPrisma as any).parentStudentRelationship.findUnique({
        where: { id: relationship.id },
      });
      expect(freshRelationship.status).toBe('REVOKED');
      expect(freshRelationship.revokedAt).not.toBeNull();
      expect(freshRelationship.revokedById).not.toBeNull();
    });

    it('no real row is deleted or orphaned across every FK-linked entity', async () => {
      const { parentUser, studentProfile, relationship } = await seedSoleGuardianFamily();
      const tutorUser = await (testPrisma as any).user.create({
        data: buildUser({ role: 'TUTOR' }),
      });
      const tutorProfile = await (testPrisma as any).tutorProfile.create({
        data: buildTutorProfile({ userId: tutorUser.id }),
      });
      const subject = await (testPrisma as any).subject.create({
        data: { name: `Subject ${randomUUID()}` },
      });
      const cohort = await (testPrisma as any).cohort.create({
        data: buildCohort({ tutorId: tutorProfile.id, subjectId: subject.id, status: 'ACTIVE' }),
      });
      const membership = await (testPrisma as any).cohortMembership.create({
        data: buildCohortMembership({
          cohortId: cohort.id,
          studentId: studentProfile.id,
          status: 'ACTIVE',
        }),
      });
      const xpEntry = await (testPrisma as any).xPLedgerEntry.create({
        data: buildXPLedgerEntry({ studentId: studentProfile.id, amount: 10 }),
      });
      const streak = await (testPrisma as any).streak.create({
        data: buildStreak({ studentId: studentProfile.id }),
      });

      await revokeOrModifyRelationship(parentUser.id, 'PARENT', relationship.id, {
        revoke: true,
      } as any);

      const freshStudent = await (testPrisma as any).studentProfile.findUnique({
        where: { id: studentProfile.id },
      });
      const freshMembership = await (testPrisma as any).cohortMembership.findUnique({
        where: { id: membership.id },
      });
      const freshXp = await (testPrisma as any).xPLedgerEntry.findUnique({
        where: { id: xpEntry.id },
      });
      const freshStreak = await (testPrisma as any).streak.findUnique({ where: { id: streak.id } });

      expect(freshStudent).not.toBeNull();
      expect(freshMembership).not.toBeNull();
      expect(freshMembership.status).toBe('ACTIVE');
      expect(freshXp).not.toBeNull();
      expect(freshStreak).not.toBeNull();
    });

    it('a non-existent relationship id is rejected cleanly, not as an unhandled Prisma error', async () => {
      const { parentUser } = await seedSoleGuardianFamily();

      await expect(
        revokeOrModifyRelationship(parentUser.id, 'PARENT', randomUUID(), {
          revoke: true,
        } as any),
      ).rejects.toMatchObject({ statusCode: expect.any(Number) });
    });

    it("the sole-guardian removal's audit log entry is durably persisted", async () => {
      const { parentUser, relationship } = await seedSoleGuardianFamily();

      await revokeOrModifyRelationship(parentUser.id, 'PARENT', relationship.id, {
        revoke: true,
      } as any);

      const auditRows = await (testPrisma as any).auditLog.findMany({
        where: { actor: parentUser.id, action: 'GUARDIAN_REMOVED', target: relationship.id },
      });
      expect(auditRows.length).toBeGreaterThanOrEqual(1);
      expect(auditRows[0].timestamp).toBeTruthy();
    });
  });

  describe('assertAccountStatusAllowsAccess — real gate, read against a real row', () => {
    it('blocks against a real, persisted GUARDIAN_REQUIRED_HOLD row', async () => {
      const { parentUser, studentProfile, relationship } = await seedSoleGuardianFamily();
      await revokeOrModifyRelationship(parentUser.id, 'PARENT', relationship.id, {
        revoke: true,
      } as any);

      await expect(assertAccountStatusAllowsAccess(studentProfile.id)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('blocks against a real, persisted PENDING_ACTIVATION row', async () => {
      const studentUser = await (testPrisma as any).user.create({
        data: buildUser({ role: 'STUDENT' }),
      });
      const studentProfile = await (testPrisma as any).studentProfile.create({
        data: buildStudentProfile({
          userId: studentUser.id,
          grade: 3,
          accountStatus: 'PENDING_ACTIVATION',
        }),
      });

      await expect(assertAccountStatusAllowsAccess(studentProfile.id)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('resolves silently once the hold is lifted — a real round-trip proof', async () => {
      const { parentUser, studentProfile, relationship } = await seedSoleGuardianFamily();
      await revokeOrModifyRelationship(parentUser.id, 'PARENT', relationship.id, {
        revoke: true,
      } as any);

      const newParentUser = await (testPrisma as any).user.create({
        data: buildUser({ role: 'PARENT' }),
      });
      const newParentProfile = await (testPrisma as any).parentProfile.create({
        data: buildParentProfile({ userId: newParentUser.id }),
      });
      await (testPrisma as any).parentStudentRelationship.create({
        data: buildParentStudentRelationship({
          parentId: newParentProfile.id,
          studentId: studentProfile.id,
          relationshipType: 'MANDATORY_GUARDIAN',
          status: 'ACTIVE',
        }),
      });
      await (testPrisma as any).studentProfile.update({
        where: { id: studentProfile.id },
        data: { accountStatus: 'ACTIVE' },
      });

      await expect(assertAccountStatusAllowsAccess(studentProfile.id)).resolves.toBeUndefined();
    });
  });
});
