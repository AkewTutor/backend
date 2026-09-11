/**
 * tests/integration/refund.service.persistence.test.ts
 *
 * Phase 7, step 7.29. Spec: `09-7-payments-earnings-persistence.md` §9.26.
 * Sibling of `09-7-payments-earnings.md` (Unit tier: `refund.service.test.ts`,
 * §9.12 — I1 fix).
 * FRs: FR-PB-007, FR-AD-012. Traces to `04-database-and-data-model.md §4.2`
 * (Refund) and `00-agent-rules.md`'s audit-log convention.
 *
 * KNOWN RED STATE, BY DESIGN — see `payment.service.persistence.test.ts`'s
 * header comment; `prisma/schema.prisma` has zero models yet. This
 * includes `testPrisma.auditLog`, whose concrete storage form
 * (`00-agent-rules.md` deliberately doesn't prescribe a Prisma table vs. a
 * structured log sink) this file assumes is a Prisma model, matching the
 * Phase 1 precedent (`tests/integration/auth.service.persistence.test.ts`'s
 * `LOGIN_FAILED_THRESHOLD` audit case) — flag and adjust this file's audit
 * queries specifically if the real implementation chose a different sink.
 *
 * Nothing in this file mocks `src/config/db.ts` — `refund.service.ts`'s
 * own `prisma` import reads the same real test database `testPrisma`
 * connects to.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { approveRefund, rejectRefund } from '../../src/services/refund.service.js';
import {
  assertTestDbReachable,
  disconnectTestDb,
  resetTestDb,
  testPrisma,
} from '../setup/testDb.js';
import {
  buildSubject,
  buildStudentProfile,
  buildTutorProfile,
} from '../factories/accounts-guardianship.factory.js';
import { buildUser } from '../factories/shared-config.factory.js';
import { buildCohort, buildCohortMembership } from '../factories/matching-cohorts.factory.js';
import { buildPayment, buildRefund } from '../factories/payments-earnings.factory.js';

/**
 * Seeds the full real FK chain plus one PENDING Refund meeting policy
 * conditions (reason: TUTOR_DROPOUT — the qualifying case per §9.12).
 */
async function seedRealPendingRefund() {
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
  const subject = await db.subject.create({ data: buildSubject() });
  const cohort = await db.cohort.create({
    data: buildCohort({
      tutorId: tutorUser.id,
      subjectId: subject.id,
      status: 'ACTIVE',
      sessionsPerWeek: 2,
    }),
  });
  const membership = await db.cohortMembership.create({
    data: buildCohortMembership({
      cohortId: cohort.id,
      studentId: studentUser.id,
      status: 'ACTIVE',
    }),
  });
  const payment = await db.payment.create({
    data: buildPayment({ cohortMembershipId: membership.id, amount: '800.00', status: 'SUCCESS' }),
  });
  const refund = await db.refund.create({
    data: buildRefund({
      paymentId: payment.id,
      reason: 'TUTOR_DROPOUT',
      sessionsRemaining: 3,
      totalSessionsBilled: 8,
      amount: '300.00',
    }),
  });
  return { studentUser, tutorUser, payment, refund };
}

async function seedRealAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (testPrisma as any).user.create({
    data: buildUser({ role: 'ADMIN', email: `admin-${randomUUID()}@example.test` }),
  });
}

describe.skip('refund.service.ts — Integration (persistence)', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('approval persists a real, terminal state — read from the database, not the return value', async () => {
    const { refund } = await seedRealPendingRefund();
    const admin = await seedRealAdmin();

    await approveRefund(refund.id, admin.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refundAfter = await (testPrisma as any).refund.findUnique({ where: { id: refund.id } });
    expect(refundAfter.status).toBe('APPROVED');
    expect(refundAfter.approvedById).toBe(admin.id);
    expect(refundAfter.approvedAt).not.toBeNull();
  });

  it('two admins racing to action the same PENDING refund — only one wins, the row lands in exactly one terminal state', async () => {
    const { refund } = await seedRealPendingRefund();
    const adminA = await seedRealAdmin();
    const adminB = await seedRealAdmin();

    const results = await Promise.allSettled([
      approveRefund(refund.id, adminA.id),
      rejectRefund(refund.id, adminB.id, 'Duplicate case'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      statusCode: 409,
      message: 'This refund has already been actioned',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refundAfter = await (testPrisma as any).refund.findUnique({ where: { id: refund.id } });
    expect(['APPROVED', 'REJECTED']).toContain(refundAfter.status);
    if (refundAfter.status === 'APPROVED') {
      expect(refundAfter.rejectedById).toBeNull();
      expect(refundAfter.rejectedAt).toBeNull();
    } else {
      expect(refundAfter.approvedById).toBeNull();
      expect(refundAfter.approvedAt).toBeNull();
    }
  });

  it('audit log entry is durably persisted on approval, not just "called"', async () => {
    const { refund } = await seedRealPendingRefund();
    const admin = await seedRealAdmin();

    await approveRefund(refund.id, admin.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditRows = await (testPrisma as any).auditLog.findMany({
      where: { actor: admin.id, action: 'REFUND_APPROVED', target: refund.id },
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows[0].timestamp).toBeTruthy();
  });

  it('audit log entry is durably persisted on rejection, and the reason is independently confirmed on the Refund row itself', async () => {
    const { refund } = await seedRealPendingRefund();
    const admin = await seedRealAdmin();

    await rejectRefund(refund.id, admin.id, 'Student-caused disruption');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditRows = await (testPrisma as any).auditLog.findMany({
      where: { actor: admin.id, action: 'REFUND_REJECTED', target: refund.id },
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refundAfter = await (testPrisma as any).refund.findUnique({ where: { id: refund.id } });
    expect(refundAfter.rejectionReason).toBe('Student-caused disruption');
  });
});
