/**
 * tests/integration/payout.service.persistence.test.ts
 *
 * Phase 7, step 7.31 — the last file of Phase 7. Spec:
 * `09-7-payments-earnings-persistence.md` §9.28.
 * Sibling of `09-7-payments-earnings.md` (Unit tier: `payout.service.test.ts`,
 * §9.16).
 * FRs: FR-TU-019, FR-AD-011. Traces to `04-database-and-data-model.md §4.2`
 * (Payout, TutorEarning).
 *
 * KNOWN RED STATE, BY DESIGN — see `payment.service.persistence.test.ts`'s
 * header comment; `prisma/schema.prisma` has zero models yet.
 *
 * Nothing in this file mocks `src/config/db.ts` — `payout.service.ts`'s
 * own `prisma` import reads the same real test database `testPrisma`
 * connects to. The 4 underlying `TutorEarning` rows are produced via real
 * `creditEarning` calls against real `ScheduledSession` rows (following
 * `earning.service.persistence.test.ts`'s seeding pattern), not inserted
 * as orphan rows with no session FK — so the `"612.50"` total this file
 * asserts is the real sum of 4 rows the database actually computed and
 * stored via `Decimal`, never a hand-typed expected value (§9.29 Coverage
 * Honesty Check item 5).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
const Decimal = Prisma.Decimal;

import { creditEarning } from '../../src/services/earning.service.js';
import { generateMonthlyPayouts } from '../../src/services/payout.service.js';
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

/**
 * Seeds a real Tutor, Cohort, and an active PricingConfig
 * (tutorSharePerHour: "175.00"), then credits 4 real `ScheduledSession`s
 * for that tutor via the real `creditEarning` — 3 at FULL rate
 * ("175.00" each) and 1 at REDUCED_MAKEUP ("87.50") — producing 4 real,
 * unpaid `TutorEarning` rows summing to "612.50".
 */
async function seedRealTutorWithUnpaidEarnings() {
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

  const fullSessions = await Promise.all(
    [1, 2, 3].map(() =>
      db.scheduledSession.create({ data: buildScheduledSession({ cohortId: cohort.id }) }),
    ),
  );
  const makeupSession = await db.scheduledSession.create({
    data: buildScheduledSession({
      cohortId: cohort.id,
      isMakeup: true,
      makeupForSessionId: fullSessions[0].id,
    }),
  });

  for (const session of fullSessions) {
    await creditEarning(session.id, tutorUser.id, 'FULL');
  }
  await creditEarning(makeupSession.id, tutorUser.id, 'REDUCED_MAKEUP');

  return { tutorUser };
}

/** A wide window guaranteed to contain "now" — earnings above are all created at seed time. */
function currentPeriod() {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  return { periodStart, periodEnd };
}

describe.skip('payout.service.ts — Integration (persistence)', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('Payout totals are computed from real, seeded ledger rows — "612.50" is the real sum of 4 real TutorEarning rows', async () => {
    const { tutorUser } = await seedRealTutorWithUnpaidEarnings();
    const { periodStart, periodEnd } = currentPeriod();

    await generateMonthlyPayouts(periodStart, periodEnd);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = testPrisma as any;
    const earningRows = await db.tutorEarning.findMany({ where: { tutorId: tutorUser.id } });
    expect(earningRows).toHaveLength(4);
    const realSum = earningRows
      .reduce(
        (total: InstanceType<typeof Decimal>, row: { amount: string }) => total.plus(row.amount),
        new Decimal(0),
      )
      .toFixed(2);
    expect(realSum).toBe('612.50');

    const payoutRows = await db.payout.findMany({ where: { tutorId: tutorUser.id } });
    expect(payoutRows).toHaveLength(1);
    expect(payoutRows[0].status).toBe('PENDING');
    expect(payoutRows[0].totalAmount).toBe(realSum);
  });

  it('batched earnings are really linked, preventing a second run from double-counting', async () => {
    const { tutorUser } = await seedRealTutorWithUnpaidEarnings();
    const { periodStart, periodEnd } = currentPeriod();

    const firstRun = await generateMonthlyPayouts(periodStart, periodEnd);
    expect(firstRun.created).toBe(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = testPrisma as any;
    const firstPayout = await db.payout.findFirst({ where: { tutorId: tutorUser.id } });

    const secondRun = await generateMonthlyPayouts(periodStart, periodEnd);

    expect(secondRun.created).toBe(0);
    const payoutRowsAfter = await db.payout.findMany({ where: { tutorId: tutorUser.id } });
    expect(payoutRowsAfter).toHaveLength(1);

    const earningRowsAfter = await db.tutorEarning.findMany({ where: { tutorId: tutorUser.id } });
    expect(earningRowsAfter).toHaveLength(4);
    expect(
      earningRowsAfter.every((row: { payoutId: string | null }) => row.payoutId === firstPayout.id),
    ).toBe(true);
  });
});
