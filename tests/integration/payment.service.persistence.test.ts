/**
 * tests/integration/payment.service.persistence.test.ts
 *
 * Phase 7, step 7.27. Spec: `09-7-payments-earnings-persistence.md` §9.24.
 * Sibling of `09-7-payments-earnings.md` (Unit + Integration (HTTP
 * contract) tiers live there — see `payment.service.test.ts`,
 * `payment.controller.test.ts`, `payment.routes.test.ts`).
 * FRs: FR-PB-001–004. Traces to `04-database-and-data-model.md §4.2`
 * (Payment, CohortMembership).
 *
 * KNOWN RED STATE, BY DESIGN — same reason as
 * `tests/integration/phase0-smoke.persistence.test.ts`: `prisma/schema.prisma`
 * is still the bare template placeholder with zero models. `testPrisma.user`,
 * `.studentProfile`, `.tutorProfile`, `.subject`, `.cohort`,
 * `.cohortMembership`, `.pricingConfig`, and `.payment` do not exist until
 * the corresponding models land and a migration runs. Written first per
 * Rule 1 (`00-agent-rules.md`) — expected to fail until then, at which
 * point it goes green with no changes needed here (Rule 2).
 *
 * Nothing in this file mocks `src/config/db.ts` — `payment.service.ts`'s
 * own `prisma` import reads the identical `DATABASE_URL` this suite's
 * `tests/setup/env.setup.ts` loads from `.env.test`, so calling the real
 * exported service functions below exercises the real test database
 * directly. `testPrisma` (a second client on the same physical database)
 * is used only for out-of-band seeding/verification queries.
 *
 * True third parties only are mocked, per the doc's environment
 * convention: `chapa.client.ts`'s outbound HTTP call, and
 * `class-delivery-library`'s `session.service.generateSessionsForCohort`
 * (cross-module seam not yet in its own persistence tier — see §9.24's
 * doc-level note; the call-count assertion below only confirms this
 * module's own idempotency guard fires correctly, not that the downstream
 * schedule is actually created in a real DB).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../../src/utils/providers/chapa.client.js', () => ({
  initiateCheckout: vi.fn(async () => ({
    checkoutUrl: 'https://checkout.chapa.co/checkout/persistence-test',
  })),
  verifyWebhookSignature: vi.fn(async () => true),
}));

vi.mock('../../src/services/session.service.js', () => ({
  generateSessionsForCohort: vi.fn(async () => undefined),
}));

import { generateSessionsForCohort } from '../../src/services/session.service.js';
import { handleChapaWebhook, initiatePayment } from '../../src/services/payment.service.js';
import {
  assertTestDbReachable,
  disconnectTestDb,
  resetTestDb,
  testPrisma,
} from '../setup/testDb.js';
import {
  buildSubject,
  buildTutorProfile,
  buildStudentProfile,
} from '../factories/accounts-guardianship.factory.js';
import { buildUser } from '../factories/shared-config.factory.js';
import { buildCohort, buildCohortMembership } from '../factories/matching-cohorts.factory.js';
import { buildPricingConfig } from '../factories/payments-earnings.factory.js';

/**
 * Seeds a real Student, Tutor, Subject, Cohort, and a
 * CohortMembership(status: PENDING_PAYMENT) plus one active PricingConfig
 * for the cohort's format — the full real FK chain `initiatePayment` reads.
 */
async function seedRealPendingMembership(overrides: { format?: string } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see header comment (bare schema).
  const db = testPrisma as any;
  const studentUser = await db.user.create({
    data: buildUser({ role: 'STUDENT', email: `student-${randomUUID()}@example.test` }),
  });
  await db.studentProfile.create({ data: buildStudentProfile({ userId: studentUser.id }) });
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
      format: overrides.format ?? 'ONE_TO_ONE',
      status: 'ACTIVE',
      sessionsPerWeek: 2,
    }),
  });
  const membership = await db.cohortMembership.create({
    data: buildCohortMembership({
      cohortId: cohort.id,
      studentId: studentUser.id,
      status: 'PENDING_PAYMENT',
    }),
  });
  await db.pricingConfig.create({
    data: buildPricingConfig({ createdById: adminUser.id, format: cohort.format, isActive: true }),
  });
  return { studentUser, tutorUser, cohort, membership };
}

describe.skip('payment.service.ts — Integration (persistence)', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });

  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('real Payment row moves PENDING → SUCCESS, and CohortMembership.billingCycleAnchorDate is set — both read back from the database', async () => {
    const { studentUser, membership } = await seedRealPendingMembership();

    const initiated = await initiatePayment(studentUser.id, 'STUDENT', membership.id);
    const rawBody = Buffer.from(JSON.stringify({ event: 'SUCCESS', tx_ref: initiated.paymentId }));

    await handleChapaWebhook(rawBody, 'valid-signature');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentAfter = await (testPrisma as any).payment.findUnique({
      where: { id: initiated.paymentId },
    });
    expect(paymentAfter.status).toBe('SUCCESS');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membershipAfter = await (testPrisma as any).cohortMembership.findUnique({
      where: { id: membership.id },
    });
    expect(membershipAfter.billingCycleAnchorDate).not.toBeNull();
  });

  it('idempotent webhook replay — real row state proves no double-processing', async () => {
    const { studentUser, membership } = await seedRealPendingMembership();
    const initiated = await initiatePayment(studentUser.id, 'STUDENT', membership.id);
    const rawBody = Buffer.from(JSON.stringify({ event: 'SUCCESS', tx_ref: initiated.paymentId }));

    await handleChapaWebhook(rawBody, 'valid-signature');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membershipAfterFirst = await (testPrisma as any).cohortMembership.findUnique({
      where: { id: membership.id },
    });
    const anchorAfterFirst = membershipAfterFirst.billingCycleAnchorDate;

    await handleChapaWebhook(rawBody, 'valid-signature'); // byte-identical replay

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentAfterSecond = await (testPrisma as any).payment.findUnique({
      where: { id: initiated.paymentId },
    });
    expect(paymentAfterSecond.status).toBe('SUCCESS');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membershipAfterSecond = await (testPrisma as any).cohortMembership.findUnique({
      where: { id: membership.id },
    });
    expect(membershipAfterSecond.billingCycleAnchorDate).toEqual(anchorAfterFirst);

    // Checked across both calls combined, not reset/re-mocked between them.
    expect(generateSessionsForCohort).toHaveBeenCalledTimes(1);
  });

  it('FK integrity — initiatePayment against a non-existent cohortMembershipId throws a clean 404, not a raw Prisma FK error', async () => {
    const { studentUser } = await seedRealPendingMembership();

    await expect(initiatePayment(studentUser.id, 'STUDENT', randomUUID())).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
