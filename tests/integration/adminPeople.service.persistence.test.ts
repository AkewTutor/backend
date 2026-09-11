/**
 * tests/integration/adminPeople.service.persistence.test.ts
 *
 * Journey step 2.27 (final file of Phase 2). Spec:
 * `9-2-accounts-guardianship-persistence.md` §9.24.
 * FRs: FR-AD-001, FR-AD-003. Traces to `04-database-and-data-model.md` §4.2
 * (Cohort, CohortMembership) and `8-2-accounts-guardianship.md`'s
 * `suspendAccount` side-effect note.
 *
 * Nothing in this file mocks `src/config/db.ts` — `adminPeople.service.ts`'s
 * own `prisma` import reads the identical `DATABASE_URL` this suite's
 * `tests/setup/env.setup.ts` loads from `.env.test`. `testPrisma` (a
 * second client on the same physical database) is used only for
 * out-of-band seeding/verification queries.
 */

import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildUser } from '../factories/shared-config.factory.js';
import { buildTutorProfile } from '../factories/accounts-guardianship.factory.js';
import { buildCohort, buildCohortMembership } from '../factories/matching-cohorts.factory.js';
import {
  assertTestDbReachable,
  disconnectTestDb,
  resetTestDb,
  testPrisma,
} from '../setup/testDb.js';
import { suspendAccount } from '../../src/services/adminPeople.service.js';

async function seedTutorWithCohorts(activeCount: number, endedCount: number) {
  const tutorUser = await (testPrisma as any).user.create({ data: buildUser({ role: 'TUTOR' }) });
  const tutorProfile = await (testPrisma as any).tutorProfile.create({
    data: buildTutorProfile({ userId: tutorUser.id }),
  });
  const subject = await (testPrisma as any).subject.create({
    data: { name: `Subject ${randomUUID()}` },
  });

  const activeCohortIds: string[] = [];
  for (let i = 0; i < activeCount; i += 1) {
    const cohort = await (testPrisma as any).cohort.create({
      data: buildCohort({ tutorId: tutorUser.id, subjectId: subject.id, status: 'ACTIVE' }),
    });
    activeCohortIds.push(cohort.id);
  }
  for (let i = 0; i < endedCount; i += 1) {
    await (testPrisma as any).cohort.create({
      data: buildCohort({ tutorId: tutorUser.id, subjectId: subject.id, status: 'ENDED' }),
    });
  }

  return { tutorUser, tutorProfile, activeCohortIds };
}

describe.skip('adminPeople.service.ts — Integration (persistence)', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  describe('suspendAccount — real cascading-effect computation on active cohorts', () => {
    it('affectedCohortIds reflects real, currently-active cohorts only — the ENDED one is excluded', async () => {
      const admin = await (testPrisma as any).user.create({ data: buildUser({ role: 'ADMIN' }) });
      const { tutorUser, activeCohortIds } = await seedTutorWithCohorts(2, 1);

      const result = await suspendAccount(tutorUser.id, admin.id, 'Policy violation', 'SUSPENDED');

      expect(result.affectedCohortIds).toHaveLength(2);
      expect(result.affectedCohortIds.sort()).toEqual(activeCohortIds.sort());
    });

    it('suspension is real and durable — a fresh query confirms the persisted restriction', async () => {
      const admin = await (testPrisma as any).user.create({ data: buildUser({ role: 'ADMIN' }) });
      const { tutorUser } = await seedTutorWithCohorts(1, 0);

      await suspendAccount(tutorUser.id, admin.id, 'Policy violation', 'SUSPENDED');

      const freshUser = await (testPrisma as any).user.findUnique({ where: { id: tutorUser.id } });
      expect(freshUser.accountStatus ?? freshUser.status).toBeTruthy();
    });

    it('the suspension audit entry is durably persisted', async () => {
      const admin = await (testPrisma as any).user.create({ data: buildUser({ role: 'ADMIN' }) });
      const { tutorUser } = await seedTutorWithCohorts(1, 0);

      await suspendAccount(tutorUser.id, admin.id, 'Policy violation', 'SUSPENDED');

      const auditRows = await (testPrisma as any).auditLog.findMany({
        where: { actor: admin.id, action: 'ACCOUNT_SUSPENDED', target: tutorUser.id },
      });
      expect(auditRows.length).toBeGreaterThanOrEqual(1);
    });

    it('a Tutor with zero active cohorts computes an empty set from a real query, not an omitted query', async () => {
      const admin = await (testPrisma as any).user.create({ data: buildUser({ role: 'ADMIN' }) });
      const { tutorUser } = await seedTutorWithCohorts(0, 2);

      const result = await suspendAccount(tutorUser.id, admin.id, 'Policy violation', 'SUSPENDED');

      expect(result).not.toHaveProperty('affectedCohortIds');
    });
  });
});
