/**
 * tests/integration/cohort.service.persistence.test.ts
 *
 * Journey step 3.16. Spec: `9-3-matching-cohorts-persistence.md` §9.16.
 * FRs: FR-MA-006, FR-MA-009, FR-MA-011, FR-MA-016. Traces to
 * `04-database-and-data-model.md` §4.2 (Cohort, CohortMembership) and the
 * partial-unique note on CohortMembership(cohortId, studentId) where
 * status != ENDED.
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
import { formOrJoinCohort, tutorExitContinuity } from '../../src/services/cohort.service.js';

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

async function seedTutorAndSubject() {
  const tutorUser = await prisma.user.create({ data: buildUser({ role: 'TUTOR' }) });
  const tutor = await prisma.tutorProfile.create({
    data: buildTutorProfile({ userId: tutorUser.id, verificationStatus: 'VERIFIED' }),
  });
  const subject = await prisma.subject.create({ data: buildSubject() });
  return { tutor, subject };
}

async function seedStudent() {
  const studentUser = await prisma.user.create({ data: buildUser({ role: 'STUDENT' }) });
  return prisma.studentProfile.create({ data: buildStudentProfile({ userId: studentUser.id }) });
}

describe.skip('formOrJoinCohort — real cohort/membership lifecycle', () => {
  it('creates a real Cohort when no compatible FORMING cohort exists', async () => {
    const { subject } = await seedTutorAndSubject();
    const student = await seedStudent();
    const matchRequest = await prisma.matchRequest.create({
      data: buildMatchRequest({
        studentId: student.id,
        subjectId: subject.id,
        format: 'ONE_TO_FIVE',
        path: 'PATH_C',
      }),
    });

    await formOrJoinCohort(matchRequest.id);

    const cohort = await prisma.cohort.findFirst({ where: { subjectId: subject.id } });
    expect(cohort).not.toBeNull();
    expect(cohort?.status).toBe('FORMING');
    expect(cohort?.groupFormationWindowExpiresAt).not.toBeNull();

    const membership = await prisma.cohortMembership.findFirst({
      where: { cohortId: cohort!.id, studentId: student.id },
    });
    expect(membership).not.toBeNull();
  });

  it('joins an existing compatible FORMING cohort, does not create a duplicate', async () => {
    const { tutor, subject } = await seedTutorAndSubject();
    const existingCohort = await prisma.cohort.create({
      data: {
        tutorId: tutor.id,
        subjectId: subject.id,
        format: 'ONE_TO_FIVE',
        status: 'FORMING',
        targetGroupSize: 5,
        groupFormationWindowExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      } as any,
    });
    const existingStudents = await Promise.all([seedStudent(), seedStudent()]);
    for (const s of existingStudents) {
      await prisma.cohortMembership.create({
        data: { cohortId: existingCohort.id, studentId: s.id, status: 'PENDING_PAYMENT' } as any,
      });
    }
    const newStudent = await seedStudent();
    const matchRequest = await prisma.matchRequest.create({
      data: buildMatchRequest({
        studentId: newStudent.id,
        subjectId: subject.id,
        format: 'ONE_TO_FIVE',
        path: 'PATH_C',
      }),
    });

    await formOrJoinCohort(matchRequest.id);

    const cohortsForSubject = await prisma.cohort.findMany({ where: { subjectId: subject.id } });
    expect(cohortsForSubject).toHaveLength(1);

    const memberships = await prisma.cohortMembership.findMany({
      where: { cohortId: existingCohort.id },
    });
    expect(memberships).toHaveLength(3);
  });

  it('last-seat concurrent race — capacity is never exceeded under real simultaneous access', async () => {
    const { tutor, subject } = await seedTutorAndSubject();
    const cohort = await prisma.cohort.create({
      data: {
        tutorId: tutor.id,
        subjectId: subject.id,
        format: 'ONE_TO_THREE',
        status: 'FORMING',
        targetGroupSize: 3,
        groupFormationWindowExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      } as any,
    });
    const existingStudents = await Promise.all([seedStudent(), seedStudent()]);
    for (const s of existingStudents) {
      await prisma.cohortMembership.create({
        data: { cohortId: cohort.id, studentId: s.id, status: 'PENDING_PAYMENT' } as any,
      });
    }

    const [studentA, studentB] = await Promise.all([seedStudent(), seedStudent()]);
    const [mrA, mrB] = await Promise.all([
      prisma.matchRequest.create({
        data: buildMatchRequest({
          studentId: studentA.id,
          subjectId: subject.id,
          format: 'ONE_TO_THREE',
          path: 'PATH_C',
        }),
      }),
      prisma.matchRequest.create({
        data: buildMatchRequest({
          studentId: studentB.id,
          subjectId: subject.id,
          format: 'ONE_TO_THREE',
          path: 'PATH_C',
        }),
      }),
    ]);

    const results = await Promise.allSettled([formOrJoinCohort(mrA.id), formOrJoinCohort(mrB.id)]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0].status === 'rejected') {
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });
    }

    const activeMemberships = await prisma.cohortMembership.findMany({
      where: { cohortId: cohort.id, status: { not: 'ENDED' } },
    });
    expect(activeMemberships).toHaveLength(3);
  });

  it('never sets a pricing field, confirmed against real rows', async () => {
    const { subject } = await seedTutorAndSubject();
    const student = await seedStudent();
    const matchRequest = await prisma.matchRequest.create({
      data: buildMatchRequest({
        studentId: student.id,
        subjectId: subject.id,
        format: 'ONE_TO_FIVE',
        path: 'PATH_C',
      }),
    });

    await formOrJoinCohort(matchRequest.id);

    const cohort = await prisma.cohort.findFirst({ where: { subjectId: subject.id } });
    expect(cohort).not.toHaveProperty('pricePerStudentPerHour');
    expect(cohort).not.toHaveProperty('amount');
  });
});

describe.skip('tutorExitContinuity — real multi-row spawn and FK integrity', () => {
  it('spawns exactly one real MatchRequest row per affected membership', async () => {
    const { tutor, subject } = await seedTutorAndSubject();
    const cohort = await prisma.cohort.create({
      data: {
        tutorId: tutor.id,
        subjectId: subject.id,
        format: 'ONE_TO_FIVE',
        status: 'ACTIVE',
      } as any,
    });
    const students = await Promise.all(Array.from({ length: 5 }, () => seedStudent()));
    for (const s of students) {
      await prisma.cohortMembership.create({
        data: { cohortId: cohort.id, studentId: s.id, status: 'ACTIVE' } as any,
      });
    }

    await tutorExitContinuity(cohort.id, 'DROPOUT');

    const spawned = await prisma.matchRequest.findMany({
      where: {
        path: 'PATH_C',
        status: 'PENDING_ADMIN_ASSIGNMENT',
        studentId: { in: students.map((s) => s.id) },
      },
    });
    expect(spawned).toHaveLength(5);
    for (const row of spawned) {
      expect(row.subjectId).toBeTruthy();
    }
  });

  it('old Cohort and its memberships are real ENDED rows, not deleted', async () => {
    const { tutor, subject } = await seedTutorAndSubject();
    const cohort = await prisma.cohort.create({
      data: {
        tutorId: tutor.id,
        subjectId: subject.id,
        format: 'ONE_TO_FIVE',
        status: 'ACTIVE',
      } as any,
    });
    const students = await Promise.all(Array.from({ length: 5 }, () => seedStudent()));
    for (const s of students) {
      await prisma.cohortMembership.create({
        data: { cohortId: cohort.id, studentId: s.id, status: 'ACTIVE' } as any,
      });
    }

    await tutorExitContinuity(cohort.id, 'SUSPENDED');

    const refreshedCohort = await prisma.cohort.findUnique({ where: { id: cohort.id } });
    expect(refreshedCohort).not.toBeNull();
    expect(refreshedCohort?.status).toBe('ENDED');
    expect(refreshedCohort?.endedReason).toBe('TUTOR_SUSPENDED');

    const memberships = await prisma.cohortMembership.findMany({ where: { cohortId: cohort.id } });
    expect(memberships).toHaveLength(5);
    for (const m of memberships) {
      expect(m.status).toBe('ENDED');
      expect((m as any).endReason).toBe('DROPPED_BY_ADMIN');
    }
  });
});
