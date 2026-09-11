/**
 * tests/integration/pricing.service.persistence.test.ts
 *
 * Phase 7, step 7.28. Spec: `09-7-payments-earnings-persistence.md` §9.25.
 * Sibling of `09-7-payments-earnings.md` (Unit tier: `pricing.service.test.ts`).
 * FRs: FR-AD-009. Traces to `04-database-and-data-model.md §4.2`
 * (PricingConfig — "partial unique... enforced at the application layer")
 * and §4.4.
 *
 * KNOWN RED STATE, BY DESIGN — see `payment.service.persistence.test.ts`'s
 * header comment; `prisma/schema.prisma` has zero models yet.
 *
 * Nothing in this file mocks `src/config/db.ts` — `pricing.service.ts`'s
 * own `prisma` import reads the same real test database `testPrisma`
 * connects to. This file proves the *outcome* of the deactivate-then-
 * activate swap under real concurrent access — something the Unit tier's
 * `expect(prisma.$transaction).toHaveBeenCalledTimes(1)` can only prove
 * the *shape* of.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { createAndActivateConfig } from '../../src/services/pricing.service.js';
import {
  assertTestDbReachable,
  disconnectTestDb,
  resetTestDb,
  testPrisma,
} from '../setup/testDb.js';
import { buildPricingConfig } from '../factories/payments-earnings.factory.js';
import { buildUser } from '../factories/shared-config.factory.js';

/** Seeds a real Admin User — PricingConfig.createdById is a real FK → User.id. */
async function seedRealAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see header comment (bare schema).
  return (testPrisma as any).user.create({
    data: buildUser({ role: 'ADMIN', email: `admin-${randomUUID()}@example.test` }),
  });
}

const validSplit = {
  pricePerStudentPerHour: '375.00',
  totalPerHour: '375.00',
  platformSharePerHour: '125.00',
  tutorSharePerHour: '250.00',
};

/** Seeds a real active PricingConfig for the given format. */
async function seedRealActiveConfig(format: string, adminId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see header comment (bare schema).
  return (testPrisma as any).pricingConfig.create({
    data: buildPricingConfig({ createdById: adminId, format, isActive: true }),
  });
}

describe.skip('pricing.service.ts — Integration (persistence)', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('the deactivate-then-activate swap is a real single transaction — exactly one active row afterward', async () => {
    const admin = await seedRealAdmin();
    await seedRealActiveConfig('ONE_TO_ONE', admin.id);

    await createAndActivateConfig('ONE_TO_ONE', validSplit, admin.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeRows = await (testPrisma as any).pricingConfig.findMany({
      where: { format: 'ONE_TO_ONE', isActive: true },
    });
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].pricePerStudentPerHour).toBe(validSplit.pricePerStudentPerHour);
  });

  it('two admins racing to activate a new config for the same format — never two active rows, never zero', async () => {
    const adminA = await seedRealAdmin();
    const adminB = await seedRealAdmin();
    await seedRealActiveConfig('ONE_TO_THREE', adminA.id);

    const inputA = {
      ...validSplit,
      pricePerStudentPerHour: '400.00',
      totalPerHour: '400.00',
      platformSharePerHour: '130.00',
      tutorSharePerHour: '270.00',
    };
    const inputB = {
      ...validSplit,
      pricePerStudentPerHour: '410.00',
      totalPerHour: '410.00',
      platformSharePerHour: '135.00',
      tutorSharePerHour: '275.00',
    };

    const results = await Promise.allSettled([
      createAndActivateConfig('ONE_TO_THREE', inputA, adminA.id),
      createAndActivateConfig('ONE_TO_THREE', inputB, adminB.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeRows = await (testPrisma as any).pricingConfig.findMany({
      where: { format: 'ONE_TO_THREE', isActive: true },
    });
    expect(activeRows).toHaveLength(1);
  });
});
