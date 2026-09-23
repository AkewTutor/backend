/**
 * tests/integration/matching.service.persistence.test.ts
 *
 * Journey step 3.15. Spec: `9-3-matching-cohorts-persistence.md` §9.15.
 * FRs: FR-MA-002, FR-MA-006. Traces to `04-database-and-data-model.md`
 * §4.2 (MatchRequest, TutorExclusion, Cohort, CohortMembership) and §4.4
 * (TutorExclusion's (studentId, tutorId) unique composite).
 *
 * Integration (persistence) tier — real Postgres test database, real
 * Prisma client, real `matching.service.ts` functions. Per
 * `00-agent-rules.md` Rule 7, this suite must fail loudly, not silently
 * fall back to a mock, if the configured test database is unreachable.
 *
 * Test environment note: this file assumes the Phase 0 infrastructure
 * (`00-test-fixtures.md` §0, journey Phase 0.1) exposes a real Prisma
 * client at `src/config/db.ts` when `NODE_ENV=test`/`DATABASE_URL` points
 * at the disposable test database, plus a `tests/setup/resetDatabase.ts`
 * helper that truncates/rolls back the tables this file touches between
 * tests. Adjust the two imports below to match whatever exact helper
 * names Phase 0 actually shipped — the behavior each case asserts is
 * pinned by the spec regardless of the helper's name.
 */

import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/db.js';
import { resetDatabase } from '../setup/resetDatabase.js';
import {
  buildStudentProfile,
  buildSubject,
  buildTutorProfile,
} from '../factories/accounts-guardianship.factory.js';
import { buildUser } from '../factories/shared-config.factory.js';
import { buildTutorExclusion } from '../factories/matching-cohorts.factory.js';
import { selectTutor } from '../../src/services/matching.service.js';
import ApiError from '../../src/utils/ApiError.js';

beforeAll(async () => {
  // Rule 7: fail loudly, never silently degrade to a mock.
  await prisma.$queryRaw`SELECT 1`;
});

afterEach(async () => {
  await resetDatabase([
    'Cohort',
    'CohortMembership',
    'TutorExclusion',
    'MatchRequest',
    'TutorProfile',
    'StudentProfile',
    'Subject',
    'User',
  ]);
});

async function seedStudentAndTutor() {
  const studentUser = await prisma.user.create({ data: buildUser({ role: 'STUDENT' }) });
  const student = await prisma.studentProfile.create({
    data: buildStudentProfile({ userId: studentUser.id }) as any,
  });
  const tutorUser = await prisma.user.create({ data: buildUser({ role: 'TUTOR' }) });
  const tutor = await prisma.tutorProfile.create({
    data: buildTutorProfile({ userId: tutorUser.id, verificationStatus: 'VERIFIED' }),
  });
  const subject = await prisma.subject.create({ data: buildSubject() });
  return { student, tutor, subject };
}

describe('selectTutor — real cohort + membership creation', () => {
  beforeEach(async () => {
    await resetDatabase([
      'Cohort',
      'CohortMembership',
      'TutorExclusion',
      'MatchRequest',
      'TutorProfile',
      'StudentProfile',
      'Subject',
      'User',
    ]);
  });

  it('successful selection persists a real Cohort and CohortMembership', async () => {
    const { student, tutor } = await seedStudentAndTutor();

    await selectTutor(student.id, 'STUDENT', undefined, tutor.id);

    const cohort = await prisma.cohort.findFirst({ where: { tutorId: tutor.id } });
    expect(cohort).not.toBeNull();
    expect(cohort?.format).toBe('ONE_TO_ONE');

    const membership = await prisma.cohortMembership.findFirst({
      where: { cohortId: cohort!.id, studentId: student.id },
    });
    expect(membership).not.toBeNull();
  });

  it('excluded tutor is rejected before any write occurs', async () => {
    const { student, tutor } = await seedStudentAndTutor();
    await prisma.tutorExclusion.create({
      data: buildTutorExclusion({ studentId: student.id, tutorId: tutor.id }),
    });

    await expect(selectTutor(student.id, 'STUDENT', undefined, tutor.id)).rejects.toBeInstanceOf(
      ApiError,
    );

    const cohort = await prisma.cohort.findFirst({ where: { tutorId: tutor.id } });
    expect(cohort).toBeNull();
  });

  it('double-submit race: two concurrent selectTutor calls for the same student, different tutors — exactly one wins', async () => {
    const { student, tutor: tutor1 } = await seedStudentAndTutor();
    const tutorUser2 = await prisma.user.create({ data: buildUser({ role: 'TUTOR' }) });
    const tutor2 = await prisma.tutorProfile.create({
      data: buildTutorProfile({ userId: tutorUser2.id, verificationStatus: 'VERIFIED' }),
    });

    const results = await Promise.allSettled([
      selectTutor(student.id, 'STUDENT', undefined, tutor1.id),
      selectTutor(student.id, 'STUDENT', undefined, tutor2.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0].status === 'rejected') {
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });
    }

    const cohorts = await prisma.cohort.findMany({
      where: { memberships: { some: { studentId: student.id } } },
    });
    expect(cohorts).toHaveLength(1);
  });
});

describe('FK integrity — real constraint enforcement, not assumed', () => {
  it('non-existent tutorId is rejected by a real foreign-key constraint, translated to a clean ApiError', async () => {
    const studentUser = await prisma.user.create({ data: buildUser({ role: 'STUDENT' }) });
    const student = await prisma.studentProfile.create({
      data: buildStudentProfile({ userId: studentUser.id }) as any,
    });
    await prisma.subject.create({ data: buildSubject() });

    await expect(
      selectTutor(student.id, 'STUDENT', undefined, randomUUID()),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('TutorExclusion — real unique constraint', () => {
  it('the (studentId, tutorId) unique composite is real, not merely documented', async () => {
    const { student, tutor } = await seedStudentAndTutor();
    await prisma.tutorExclusion.create({
      data: buildTutorExclusion({ studentId: student.id, tutorId: tutor.id }),
    });

    await expect(
      prisma.tutorExclusion.create({
        data: buildTutorExclusion({ studentId: student.id, tutorId: tutor.id }),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it("rejectCohort's exclusion write does not crash if an exclusion for the pair already exists", async () => {
    const { student, tutor, subject } = await seedStudentAndTutor();
    await prisma.tutorExclusion.create({
      data: buildTutorExclusion({ studentId: student.id, tutorId: tutor.id }),
    });
    const cohort = await prisma.cohort.create({
      data: {
        tutorId: tutor.id,
        subjectId: subject.id,
        format: 'ONE_TO_ONE',
        status: 'PENDING_ADMIN_APPROVAL',
      } as any,
    });
    await prisma.cohortMembership.create({
      data: { cohortId: cohort.id, studentId: student.id, status: 'PENDING_PAYMENT' } as any,
    });

    const { rejectCohort } = await import('../../src/services/cohort.service.js');
    const adminUser = await prisma.user.create({ data: buildUser({ role: 'ADMIN' }) });

    await expect(rejectCohort(cohort.id, adminUser.id, 'reason')).resolves.toBeDefined();

    const refreshedCohort = await prisma.cohort.findUnique({ where: { id: cohort.id } });
    expect(refreshedCohort?.status).not.toBe('PENDING_ADMIN_APPROVAL');
  });
});
