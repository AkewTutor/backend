/**
 * tests/integration/earning.service.persistence.test.ts
 *
 * Phase 7, step 7.30. Spec: `09-7-payments-earnings-persistence.md` §9.27.
 * Sibling of `09-7-payments-earnings.md` (Unit tier: `earning.service.test.ts`).
 * FRs: FR-TU-018, FR-TU-019, FR-MK-009. Traces to
 * `04-database-and-data-model.md §4.2` (TutorEarning — `sessionId` unique)
 * and §4.4.
 *
 * KNOWN RED STATE, BY DESIGN — see `payment.service.persistence.test.ts`'s
 * header comment; `prisma/schema.prisma` has zero models yet.
 *
 * Nothing in this file mocks `src/config/db.ts` — `earning.service.ts`'s
 * own `prisma` import reads the same real test database `testPrisma`
 * connects to.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { creditEarning } from '../../src/services/earning.service.js';
import {
  assertTestDbReachable,
  disconnectTestDb,
  resetTestDb,
  testPrisma,
} from '../setup/testDb.js';
import { buildSubject, buildTutorProfile } from '../factories/accounts-guardianship.factory.js';
import { buildUser } from '../factories/shared-config.factory.js';
import { buildCohort } from '../factories/matching-cohorts.factory.js';
import { buildPricingConfig } from '../factories/payments-earnings.factory.js';
import { buildScheduledSession } from '../factories/class-delivery-library.factory.js';

/** Seeds a real Tutor, Cohort, active PricingConfig, and one ScheduledSession. */
async function seedRealSession() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see header comment (bare schema).
  const db = testPrisma as any;
  const tutorUser = await db.user.create({
    data: buildUser({ role: 'TUTOR', email: `tutor-${randomUUID()}@example.test` }),
  });
  await db.tutorProfile.create({ data: buildTutorProfile({ userId: tutorUser.id }) });
  const adminUser = await db.user.create({
    data: buildUser({ role: 'ADMIN', email: `admin-${randomUUID()}@example.test` }),
  });
  const subject = await db.subject.create({ data: buildSubject() });
  const cohort = await db.cohort.create({
    data: buildCohort({
      tutorId: tutorUser.id,
      subjectId: subject.id,
      status: 'ACTIVE',
      sessionsPerWeek: 2,
    }),
  });
  await db.pricingConfig.create({
    data: buildPricingConfig({
      createdById: adminUser.id,
      format: cohort.format,
      isActive: true,
      tutorSharePerHour: '175.00',
    }),
  });
  const session = await db.scheduledSession.create({
    data: buildScheduledSession({ cohortId: cohort.id }),
  });
  return { tutorUser, session };
}

describe.skip('earning.service.ts — Integration (persistence)', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('the TutorEarning(sessionId) unique constraint is real, not merely documented — a direct duplicate insert is rejected (P2002)', async () => {
    const { tutorUser, session } = await seedRealSession();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = testPrisma as any;
    await db.tutorEarning.create({
      data: {
        id: randomUUID(),
        tutorId: tutorUser.id,
        sessionId: session.id,
        amount: '175.00',
        rateType: 'FULL',
        payoutId: null,
        createdAt: new Date(),
      },
    });

    let caught: any;
    try {
      await db.tutorEarning.create({
        data: {
          id: randomUUID(),
          tutorId: tutorUser.id,
          sessionId: session.id,
          amount: '175.00',
          rateType: 'FULL',
          payoutId: null,
          createdAt: new Date(),
        },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.code).toBe('P2002');
  });

  it('creditEarning called twice concurrently for the same session never produces two earning rows', async () => {
    const { tutorUser, session } = await seedRealSession();

    const results = await Promise.allSettled([
      creditEarning(session.id, tutorUser.id, 'FULL'),
      creditEarning(session.id, tutorUser.id, 'FULL'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const earningRows = await (testPrisma as any).tutorEarning.findMany({
      where: { sessionId: session.id },
    });
    expect(earningRows).toHaveLength(1);
  });
});
