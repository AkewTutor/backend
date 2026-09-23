/**
 * tests/integration/adminMatching.service.persistence.test.ts
 *
 * Journey step 3.17. Spec: `9-3-matching-cohorts-persistence.md` §9.17.
 * FRs: FR-MA-013–015, FR-MA-017. Traces to `04-database-and-data-model.md`
 * §4.2 (Cohort, CohortMembership, MatchRequest).
 *
 * Integration (persistence) tier — real Postgres test database, real
 * Prisma client. See `matching.service.persistence.test.ts`'s header note
 * on the assumed `resetDatabase` / real-`prisma` test-environment wiring.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/db.js';
import { resetDatabase } from '../setup/resetDatabase.js';
import {
  buildStudentProfile,
  buildSubject,
  buildTutorProfile,
} from '../factories/accounts-guardianship.factory.js';
import { buildUser } from '../factories/shared-config.factory.js';
import { buildMatchRequest } from '../factories/matching-cohorts.factory.js';
import {
  manuallyAssembleGroup,
  manuallyAssignTutor,
} from '../../src/services/adminMatching.service.js';

const TABLES = [
  'MatchRequest',
  'CohortMembership',
  'Cohort',
  'TutorProfile',
  'StudentProfile',
  'Subject',
  'User',
];

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDatabase(TABLES);
});

async function seedVerifiedTutor(subjectId: string) {
  const tutorUser = await prisma.user.create({ data: buildUser({ role: 'TUTOR' }) });
  const tutor = await prisma.tutorProfile.create({
    data: buildTutorProfile({ userId: tutorUser.id, verificationStatus: 'VERIFIED' }),
  });
  await prisma.tutorSubjectRanking.create({
    data: { tutorId: tutor.id, subjectId, rank: 1 } as any,
  });
  return tutor;
}

async function seedStudent() {
  const studentUser = await prisma.user.create({ data: buildUser({ role: 'STUDENT' }) });
  return prisma.studentProfile.create({
    data: buildStudentProfile({ userId: studentUser.id }) as any,
  });
}

describe('manuallyAssignTutor / manuallyAssembleGroup — real claim race', () => {
  it('two admins racing the same single MatchRequest — real conditional-write guard, not a mocked one', async () => {
    const subject = await prisma.subject.create({ data: buildSubject() });
    const tutor = await seedVerifiedTutor(subject.id);
    const student = await seedStudent();
    const matchRequest = await prisma.matchRequest.create({
      data: buildMatchRequest({
        studentId: student.id,
        subjectId: subject.id,
        status: 'PENDING_ADMIN_ASSIGNMENT',
        path: 'PATH_B',
      }),
    });
    const adminUser1 = await prisma.user.create({ data: buildUser({ role: 'ADMIN' }) });
    const adminUser2 = await prisma.user.create({ data: buildUser({ role: 'ADMIN' }) });

    const results = await Promise.allSettled([
      manuallyAssignTutor([matchRequest.id], tutor.id, adminUser1.id),
      manuallyAssignTutor([matchRequest.id], tutor.id, adminUser2.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0].status === 'rejected') {
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });
    }

    const cohortsFromRequest = await prisma.cohort.findMany({
      where: { memberships: { some: { studentId: student.id } } },
    });
    expect(cohortsFromRequest).toHaveLength(1);

    const refreshedRequest = await prisma.matchRequest.findUnique({
      where: { id: matchRequest.id },
    });
    expect(refreshedRequest?.status).not.toBe('PENDING_ADMIN_ASSIGNMENT');
  });

  it('partial-array claim conflict rolls back atomically — no partial Cohort from the losing call', async () => {
    const subject = await prisma.subject.create({ data: buildSubject() });
    const tutor1 = await seedVerifiedTutor(subject.id);
    const tutor2 = await seedVerifiedTutor(subject.id);
    const students = await Promise.all(Array.from({ length: 6 }, () => seedStudent()));
    const matchRequests = await Promise.all(
      students.map((s) =>
        prisma.matchRequest.create({
          data: buildMatchRequest({
            studentId: s.id,
            subjectId: subject.id,
            status: 'PENDING_ADMIN_ASSIGNMENT',
            path: 'PATH_C',
          }),
        }),
      ),
    );
    const firstFive = matchRequests.slice(0, 5).map((m) => m.id);
    const admin1 = await prisma.user.create({ data: buildUser({ role: 'ADMIN' }) });
    const admin2 = await prisma.user.create({ data: buildUser({ role: 'ADMIN' }) });

    await manuallyAssignTutor(firstFive, tutor1.id, admin1.id);

    const fourOfFive = firstFive.slice(0, 4);
    const freshOne = matchRequests[5].id;
    const secondCallIds = [...fourOfFive, freshOne];

    await expect(manuallyAssembleGroup(secondCallIds, tutor2.id, admin2.id)).rejects.toMatchObject({
      statusCode: 409,
    });

    const cohortsForTutor2 = await prisma.cohort.findMany({ where: { tutorId: tutor2.id } });
    expect(cohortsForTutor2).toHaveLength(0);

    const freshRequestUnchanged = await prisma.matchRequest.findUnique({ where: { id: freshOne } });
    expect(freshRequestUnchanged?.status).toBe('PENDING_ADMIN_ASSIGNMENT');
  });
});
