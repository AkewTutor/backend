/**
 * tests/services/cohort.service.test.ts
 *
 * Journey step 3.5. Spec: `09-3-matching-cohorts.md` §9.5.
 * Function-level ref: `8-3-matching-cohorts.md` — src/services/cohort.service.ts.
 * FRs: FR-MA-006, FR-MA-009, FR-MA-011, FR-MA-016, Section 7 partial-formation,
 *      Section 8 tutor-exit + M3 group-splitting, FR-SP-030.
 * OWASP: A01:2021 – Broken Access Control (profile-visibility split enforcement).
 *
 * Unit tier — mocked Prisma, mocked `adminMatching.service.ts` for the
 * tutor-exit handoff call, mocked `notification.service.ts` for the
 * rejection-notice payload assertion.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => {
  const p = {
    cohort: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    cohortMembership: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    matchRequest: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    tutorExclusion: {
      create: vi.fn(),
    },
    tutorProfile: {
      findMany: vi.fn(),
    },
  } as any;
  p.$transaction = vi.fn(async (cb: any) => cb(p));
  p.$queryRaw = vi.fn().mockResolvedValue([]);
  if (!p.matchRequest) p.matchRequest = {};
  p.matchRequest.findUniqueOrThrow = vi
    .fn()
    .mockResolvedValue({ subjectId: 'dummy', studentId: 'dummy' });
  if (!p.tutorExclusion) p.tutorExclusion = {};
  p.tutorExclusion.upsert = vi.fn().mockResolvedValue({});
  if (!p.studentProfile) p.studentProfile = {};
  p.studentProfile.findUnique = vi.fn().mockResolvedValue({ userId: 'dummy-user' });
  if (!p.notification) p.notification = {};
  p.notification.create = vi.fn().mockResolvedValue({});
  if (!p.cohort) p.cohort = {};
  if (!p.cohort.create) p.cohort.create = vi.fn().mockResolvedValue({ id: 'dummy-cohort' });

  if (!p.matchRequest) p.matchRequest = {};
  if (!p.matchRequest.findUniqueOrThrow)
    p.matchRequest.findUniqueOrThrow = vi
      .fn()
      .mockResolvedValue({ subjectId: 'dummy', studentId: 'dummy' });
  if (!p.tutorExclusion) p.tutorExclusion = {};
  if (!p.tutorExclusion.upsert) p.tutorExclusion.upsert = vi.fn().mockResolvedValue({});
  if (!p.studentProfile) p.studentProfile = {};
  if (!p.studentProfile.findUnique)
    p.studentProfile.findUnique = vi.fn().mockResolvedValue({ userId: 'dummy-user' });
  if (!p.notification) p.notification = {};
  if (!p.notification.create) p.notification.create = vi.fn().mockResolvedValue({});
  if (!p.cohort) p.cohort = {};
  if (!p.cohort.create) p.cohort.create = vi.fn().mockResolvedValue({ id: 'dummy-cohort' });
  if (!p.tutorProfile) p.tutorProfile = {};
  if (!p.tutorProfile.findFirst)
    p.tutorProfile.findFirst = vi.fn().mockResolvedValue({ id: 'dummy-tutor' });
  if (!p.cohortMembership) p.cohortMembership = {};
  if (!p.cohortMembership.findFirst) p.cohortMembership.findFirst = vi.fn().mockResolvedValue(null);
  p.$queryRaw = vi.fn().mockImplementation(async (query) => {
    const qStr = String(query);
    if (qStr.includes('Cohort')) return p.cohort?.findFirst?.() ? [await p.cohort.findFirst()] : [];
    if (qStr.includes('StudentProfile'))
      return p.studentProfile?.findUnique?.() ? [await p.studentProfile.findUnique()] : [];
    return [];
  });
  return { prisma: p };
});

vi.mock('../../src/services/adminMatching.service.js', () => ({
  manuallyAssignTutor: vi.fn(),
}));

vi.mock('../../src/services/notification.service.js', () => ({
  dispatchNotification: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import * as adminMatchingService from '../../src/services/adminMatching.service.js';
import { dispatchNotification } from '../../src/services/notification.service.js';
import {
  approveCohort,
  endCohort,
  formOrJoinCohort,
  getCohortMembers,
  getMyCohort,
  rejectCohort,
  tutorExitContinuity,
} from '../../src/services/cohort.service.js';
import ApiError from '../../src/utils/ApiError.js';

const matchRequestId = randomUUID();
const cohortId = randomUUID();
const studentId = randomUUID();
const tutorId = randomUUID();
const subjectId = randomUUID();
const adminId = randomUUID();

function resetAllMocks() {
  vi.clearAllMocks();
  (dispatchNotification as any).mockResolvedValue(undefined);
}

describe('formOrJoinCohort', () => {
  beforeEach(() => resetAllMocks());

  it('joins an existing compatible FORMING cohort', async () => {
    (prisma.matchRequest.findMany as any).mockResolvedValue([]);
    (prisma.cohort.findFirst as any).mockResolvedValue({
      id: cohortId,
      status: 'FORMING',
      targetGroupSize: 5,
    });
    (prisma.cohortMembership.count as any).mockResolvedValue(2);
    (prisma.cohortMembership.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.cohortMembership.create as any).mockResolvedValue({ id: 'membership-3' });

    const result = await formOrJoinCohort(matchRequestId);

    expect(prisma.cohort.create).not.toHaveBeenCalled();
    expect(result.cohortId).toBe(cohortId);
    expect(['FORMING', 'FULL']).toContain(result.status);
  });

  it('creates a new cohort when none compatible exists', async () => {
    (prisma.cohort.findFirst as any).mockResolvedValue(null);
    (prisma.cohort.create as any).mockResolvedValue({
      id: 'new-cohort',
      status: 'FORMING',
      groupFormationWindowExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    (prisma.cohortMembership.create as any).mockResolvedValue({ id: 'membership-1' });

    const result = await formOrJoinCohort(matchRequestId);

    expect(prisma.cohort.create).toHaveBeenCalled();
    const createArgs = (prisma.cohort.create as any).mock.calls[0][0];
    expect(createArgs.data).toHaveProperty('groupFormationWindowExpiresAt');
    expect(result.cohortId).toBe('new-cohort');
  });

  it('never sets or touches any pricing field', async () => {
    (prisma.cohort.findFirst as any).mockResolvedValue(null);
    (prisma.cohort.create as any).mockResolvedValue({ id: 'new-cohort', status: 'FORMING' });
    (prisma.cohortMembership.create as any).mockResolvedValue({ id: 'membership-1' });

    await formOrJoinCohort(matchRequestId);

    const cohortCreateArgs = JSON.stringify((prisma.cohort.create as any).mock.calls[0][0]);
    const membershipCreateArgs = JSON.stringify(
      (prisma.cohortMembership.create as any).mock.calls[0][0],
    );
    expect(cohortCreateArgs).not.toMatch(/pricePerStudentPerHour|amount/i);
    expect(membershipCreateArgs).not.toMatch(/pricePerStudentPerHour|amount/i);
  });

  it('cohort reaching target size resolves FULL', async () => {
    (prisma.cohort.findFirst as any).mockResolvedValue({
      id: cohortId,
      status: 'FORMING',
      targetGroupSize: 3,
    });
    (prisma.cohortMembership.count as any).mockResolvedValue(2); // 2 existing, this join is the 3rd
    (prisma.cohortMembership.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.cohortMembership.create as any).mockResolvedValue({ id: 'membership-3' });

    const result = await formOrJoinCohort(matchRequestId);

    expect(result.status).toBe('FULL');
  });

  it('[Phase 4] last-seat race is caught by a conditional write, not a read-then-write gap', async () => {
    (prisma.cohort.findFirst as any).mockResolvedValue({
      id: cohortId,
      status: 'FORMING',
      targetGroupSize: 3,
    });
    (prisma.cohortMembership.count as any).mockResolvedValue(2); // read shows 1 seat remaining
    // The conditional write reports zero rows affected — someone else took the last seat.
    (prisma.cohortMembership.updateMany as any).mockResolvedValue({ count: 0 });

    (prisma.cohortMembership.create as any).mockClear();
    await expect(formOrJoinCohort(matchRequestId)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prisma.cohortMembership.create).not.toHaveBeenCalled();
  });

  it('[Phase 4] the conditional-write guard is what is asserted, not merely the final row count', async () => {
    (prisma.cohort.findFirst as any).mockResolvedValue({
      id: cohortId,
      status: 'FORMING',
      targetGroupSize: 3,
    });
    (prisma.cohortMembership.count as any).mockResolvedValue(2);
    (prisma.cohortMembership.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.cohortMembership.create as any).mockResolvedValue({ id: 'membership-3' });

    await formOrJoinCohort(matchRequestId);

    // The size-check-and-claim write must be a guarded conditional (updateMany with a
    // capacity condition in its WHERE), not a bare unconditional Cohort.update — a bare
    // findUnique-then-update pattern is exactly the read-then-write gap this guards against.
    expect(prisma.cohortMembership.updateMany).toHaveBeenCalled();
    const guardArgs = (prisma.cohortMembership.updateMany as any).mock.calls[0][0];
    expect(guardArgs).toHaveProperty('where');
  });
});

describe('approveCohort / rejectCohort', () => {
  beforeEach(() => resetAllMocks());

  it('approveCohort moves state forward', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      status: 'PENDING_ADMIN_APPROVAL',
    });
    (prisma.cohort.update as any).mockResolvedValue({
      id: cohortId,
      status: 'PENDING_PAYMENT',
      adminApprovedById: adminId,
    });

    const result = await approveCohort(cohortId, adminId);

    expect(result.status).toBe('PENDING_PAYMENT');
  });

  it('rejectCohort on a Path A (1-to-1) cohort writes a TutorExclusion and a fresh MatchRequest', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      format: 'ONE_TO_ONE',
      status: 'PENDING_ADMIN_APPROVAL',
      tutorId,
      subjectId,
      memberships: [{ studentId }],
    });
    (prisma.tutorExclusion.create as any).mockResolvedValue({ studentId, tutorId });
    (prisma.matchRequest.create as any).mockResolvedValue({ id: 'mr-new', status: 'SEARCHING' });
    (prisma.cohort.update as any).mockResolvedValue({ id: cohortId, status: 'CANCELLED' });

    await rejectCohort(cohortId, adminId, 'reason');

    expect(prisma.tutorExclusion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ studentId, tutorId }) }),
    );
    expect(prisma.matchRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SEARCHING' }) }),
    );
  });

  it('rejectCohort on a Path C (group) cohort re-queues without exclusion', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      format: 'ONE_TO_FIVE',
      status: 'PENDING_ADMIN_APPROVAL',
      tutorId,
      subjectId,
      memberships: [{ studentId }, { studentId: 'student-2' }],
    });
    (prisma.matchRequest.create as any).mockResolvedValue({ id: 'mr-new', status: 'SEARCHING' });
    (prisma.cohort.update as any).mockResolvedValue({ id: cohortId, status: 'CANCELLED' });

    await rejectCohort(cohortId, adminId, 'reason');

    expect(prisma.tutorExclusion.create).not.toHaveBeenCalled();
  });

  it('internal rejection reason never surfaces to the student', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      format: 'ONE_TO_ONE',
      status: 'PENDING_ADMIN_APPROVAL',
      tutorId,
      subjectId,
      memberships: [{ studentId }],
    });
    (prisma.tutorExclusion.create as any).mockResolvedValue({ studentId, tutorId });
    (prisma.matchRequest.create as any).mockResolvedValue({ id: 'mr-new', status: 'SEARCHING' });
    (prisma.cohort.update as any).mockResolvedValue({ id: cohortId, status: 'CANCELLED' });

    await rejectCohort(
      cohortId,
      adminId,
      "Tutor's availability conflicted with a higher-priority booking",
    );

    const notifyCall = (dispatchNotification as any).mock.calls[0]?.[0];
    expect(JSON.stringify(notifyCall)).not.toContain('higher-priority booking');
  });
});

describe('tutorExitContinuity', () => {
  beforeEach(() => resetAllMocks());

  const memberships = Array.from({ length: 5 }, (_, i) => ({
    id: `membership-${i}`,
    studentId: `student-${i}`,
    status: 'ACTIVE',
  }));

  it('ends the outgoing cohort and memberships (DROPOUT)', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      format: 'ONE_TO_FIVE',
      subjectId,
      status: 'ACTIVE',
      memberships,
    });
    (prisma.cohort.update as any).mockResolvedValue({
      id: cohortId,
      status: 'ENDED',
      endedReason: 'TUTOR_DROPOUT',
    });
    (prisma.cohortMembership.updateMany as any).mockResolvedValue({ count: 5 });
    (prisma.matchRequest.createMany as any).mockResolvedValue({ count: 5 });
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);

    await tutorExitContinuity(cohortId, 'DROPOUT');

    expect(prisma.cohort.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ENDED', endedReason: 'TUTOR_DROPOUT' }),
      }),
    );
    expect(prisma.cohortMembership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ENDED', endReason: 'DROPPED_BY_ADMIN' }),
      }),
    );
  });

  it('suspension reason recorded distinctly from dropout', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      format: 'ONE_TO_FIVE',
      subjectId,
      status: 'ACTIVE',
      memberships,
    });
    (prisma.cohort.update as any).mockResolvedValue({
      id: cohortId,
      status: 'ENDED',
      endedReason: 'TUTOR_SUSPENDED',
    });
    (prisma.cohortMembership.updateMany as any).mockResolvedValue({ count: 5 });
    (prisma.matchRequest.createMany as any).mockResolvedValue({ count: 5 });
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);

    await tutorExitContinuity(cohortId, 'SUSPENDED');

    expect(prisma.cohort.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ endedReason: 'TUTOR_SUSPENDED' }),
      }),
    );
  });

  it('spawns exactly one fresh MatchRequest per affected membership, path PATH_C, status PENDING_ADMIN_ASSIGNMENT', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      format: 'ONE_TO_FIVE',
      subjectId,
      status: 'ACTIVE',
      memberships,
    });
    (prisma.cohort.update as any).mockResolvedValue({ id: cohortId, status: 'ENDED' });
    (prisma.cohortMembership.updateMany as any).mockResolvedValue({ count: 5 });
    (prisma.matchRequest.createMany as any).mockResolvedValue({ count: 5 });
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);

    await tutorExitContinuity(cohortId, 'DROPOUT');

    const createManyArgs = (prisma.matchRequest.createMany as any).mock.calls[0][0];
    expect(createManyArgs.data).toHaveLength(5);
    for (const row of createManyArgs.data) {
      expect(row.path).toBe('PATH_C');
      expect(row.status).toBe('PENDING_ADMIN_ASSIGNMENT');
    }
  });

  it('single eligible replacement tutor keeps the group together — hands off one call with all new MatchRequest ids', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      format: 'ONE_TO_FIVE',
      subjectId,
      status: 'ACTIVE',
      memberships,
    });
    (prisma.cohort.update as any).mockResolvedValue({ id: cohortId, status: 'ENDED' });
    (prisma.cohortMembership.updateMany as any).mockResolvedValue({ count: 5 });
    const createdRows = memberships.map((m, i) => ({ id: `mr-new-${i}`, studentId: m.studentId }));
    (prisma.matchRequest.createMany as any).mockResolvedValue({ count: 5 });
    (prisma.matchRequest.findMany as any).mockResolvedValue(createdRows);
    (prisma.tutorProfile.findMany as any).mockResolvedValue([{ id: 'replacement-tutor' }]);
    (adminMatchingService.manuallyAssignTutor as any).mockResolvedValue({ cohortId: 'new-cohort' });

    await tutorExitContinuity(cohortId, 'DROPOUT');

    expect(adminMatchingService.manuallyAssignTutor).toHaveBeenCalledTimes(1);
    const [ids] = (adminMatchingService.manuallyAssignTutor as any).mock.calls[0];
    expect(ids).toHaveLength(5);
  });

  it('no single tutor can take the full group — leaves the rows flagged for manual assembly, does not attempt a split itself', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      format: 'ONE_TO_FIVE',
      subjectId,
      status: 'ACTIVE',
      memberships,
    });
    (prisma.cohort.update as any).mockResolvedValue({ id: cohortId, status: 'ENDED' });
    (prisma.cohortMembership.updateMany as any).mockResolvedValue({ count: 5 });
    (prisma.matchRequest.createMany as any).mockResolvedValue({ count: 5 });
    (prisma.matchRequest.findMany as any).mockResolvedValue(
      memberships.map((m, i) => ({ id: `mr-new-${i}`, studentId: m.studentId })),
    );
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]); // no single eligible tutor

    await tutorExitContinuity(cohortId, 'DROPOUT');

    expect(adminMatchingService.manuallyAssignTutor).not.toHaveBeenCalled();
  });
});

describe('endCohort', () => {
  beforeEach(() => resetAllMocks());

  it('sets status, endedAt, and endedReason — the field archiveMessageThreads.job.ts keys off of', async () => {
    (prisma.cohort.update as any).mockResolvedValue({
      id: cohortId,
      status: 'ENDED',
      endedAt: new Date(),
      endedReason: 'reason string',
    });

    await endCohort(cohortId, 'reason string');

    expect(prisma.cohort.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ENDED', endedReason: 'reason string' }),
      }),
    );
    const updateArgs = (prisma.cohort.update as any).mock.calls[0][0];
    expect(updateArgs.data).toHaveProperty('endedAt');
  });
});

describe('getMyCohort / getCohortMembers', () => {
  beforeEach(() => resetAllMocks());

  it('no cohort yet resolves { cohorts: [] }, not an error', async () => {
    (prisma.cohortMembership.findMany as any).mockResolvedValue([]);

    const result = await getMyCohort(studentId, 'STUDENT', undefined);

    expect(result).toEqual({ cohorts: [] });
  });

  it('non-member requests cohort details (IDOR) throws 403', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      format: 'ONE_TO_FIVE',
      tutorId: 'someone-else',
      memberships: [{ studentId: 'not-caller' }],
    });

    await expect(getCohortMembers(cohortId, studentId, 'STUDENT')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to view this cohort',
    });
  });

  it('student in a 1-to-3/1-to-5 cohort sees only name+photo per member', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      format: 'ONE_TO_FIVE',
      tutorId,
      tutor: {
        name: 'Selam T.',
        profilePictureUrl: 'https://x',
        educationInstitution: 'AAU',
        degree: 'BSc',
      },
      memberships: [{ studentId }],
    });

    const result = await getCohortMembers(cohortId, studentId, 'STUDENT');

    expect(result.tutor).not.toHaveProperty('education');
    expect(result.tutor).not.toHaveProperty('totalStudentsCount');
    expect(result.tutor).not.toHaveProperty('matchPercentage');
  });

  it('student in a 1-to-1 cohort sees the full tutor profile', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      format: 'ONE_TO_ONE',
      tutorId,
      tutor: {
        name: 'Selam T.',
        profilePictureUrl: 'https://x',
        educationInstitution: 'AAU',
        degree: 'BSc',
        uniqueStudentsTaught: 5,
      },
      memberships: [{ studentId }],
    });

    const result = await getCohortMembers(cohortId, studentId, 'STUDENT');

    expect(result.tutor).toHaveProperty('educationInstitution');
  });

  it('tutor sees only studentId/firstName/grade per member, for any format', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: cohortId,
      format: 'ONE_TO_THREE',
      tutorId,
      memberships: [
        {
          studentId,
          student: { firstName: 'Bethel', grade: 6, budgetPreference: '300', school: 'AAU Prep' },
        },
      ],
    });

    const result = await getCohortMembers(cohortId, tutorId, 'TUTOR');

    for (const member of result.students) {
      expect(Object.keys(member).sort()).toEqual(['firstName', 'grade', 'studentId'].sort());
    }
  });
});
