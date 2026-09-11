/**
 * tests/integration/badge.service.persistence.test.ts
 *
 * Journey step 6.15. Spec: `09-6-gamification-engagement.md` §9.15
 * (real unique-constraint confirmation — StudentBadge, TutorBadge composites).
 * FRs: FR-GA-003, FR-GA-005. Traces to `04-database-and-data-model.md` §4.2
 * (StudentBadge, TutorBadge).
 *
 * Real database, no silent mock fallback (Rule 7). Confirms the schema-level
 * unique constraints regardless of which behavior `awardStudentBadge` /
 * `awardTutorBadge` eventually implement for the re-award case (§9.4's
 * flagged, not-hard-asserted item) — see §9.17's explicit note that this
 * tier doesn't resolve that open behavioral decision.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildStudentProfile,
  buildTutorProfile,
} from '../factories/accounts-guardianship.factory.js';
import { buildUser } from '../factories/shared-config.factory.js';
import { buildBadge, buildChallenge } from '../factories/gamification-engagement.factory.js';
import {
  assertTestDbReachable,
  disconnectTestDb,
  resetTestDb,
  testPrisma,
} from '../setup/testDb.js';

async function seedRealStudent() {
  const user = await (testPrisma as any).user.create({ data: buildUser() });
  return (testPrisma as any).studentProfile.create({
    data: buildStudentProfile({ userId: user.id }),
  });
}

async function seedRealTutor() {
  const user = await (testPrisma as any).user.create({ data: buildUser({ role: 'TUTOR' }) });
  return (testPrisma as any).tutorProfile.create({ data: buildTutorProfile({ userId: user.id }) });
}

async function seedRealBadge(overrides: Record<string, unknown> = {}) {
  return (testPrisma as any).badge.create({ data: buildBadge(overrides) });
}

describe.skip('badge.service.ts — Integration (persistence)', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('StudentBadge(studentId, badgeId) composite is real', async () => {
    const student = await seedRealStudent();
    const badge = await seedRealBadge({ category: 'STUDENT' });

    await (testPrisma as any).studentBadge.create({
      data: { studentId: student.id, badgeId: badge.id },
    });

    await expect(
      (testPrisma as any).studentBadge.create({
        data: { studentId: student.id, badgeId: badge.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('TutorBadge(tutorId, badgeId) composite is real', async () => {
    const tutor = await seedRealTutor();
    const badge = await seedRealBadge({ category: 'TUTOR' });

    await (testPrisma as any).tutorBadge.create({
      data: { tutorId: tutor.id, badgeId: badge.id },
    });

    await expect(
      (testPrisma as any).tutorBadge.create({
        data: { tutorId: tutor.id, badgeId: badge.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  // §9.15 covers this composite alongside StudentBadge/TutorBadge above;
  // there is no dedicated challenge.service.persistence.test.ts per §9.13's
  // three-file Test File Map, so it lives here as the third unique-composite
  // confirmation rather than in streak.service.persistence.test.ts (which is
  // reserved for the concurrent-update race case).
  it('ChallengeProgress(studentId, challengeId) composite is real', async () => {
    const student = await seedRealStudent();
    const admin = await (testPrisma as any).user.create({ data: buildUser({ role: 'ADMIN' }) });
    const challenge = await (testPrisma as any).challenge.create({
      data: buildChallenge({ createdById: admin.id, targetValue: 3 }),
    });

    await (testPrisma as any).challengeProgress.create({
      data: { studentId: student.id, challengeId: challenge.id },
    });

    await expect(
      (testPrisma as any).challengeProgress.create({
        data: { studentId: student.id, challengeId: challenge.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
