/**
 * tests/services/weeklyAssessment.service.test.ts
 *
 * Journey step 4.25. Spec: `09-4-class-delivery-library.md` §9.20.
 * FRs: FR-SP-038, FR-TU-017.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    cohortMembership: { findUnique: vi.fn(), findFirst: vi.fn() },
    weeklyAssessment: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import {
  getAssessmentsForStudent,
  submitAssessment,
} from '../../src/services/weeklyAssessment.service.js';

const TUTOR_ID = 'tutor-1';
const MEMBERSHIP_ID = 'membership-1';

function resetMocks() {
  vi.clearAllMocks();
}

describe.skip('submitAssessment', () => {
  beforeEach(resetMocks);

  it('a tutor submits a new weekly assessment', async () => {
    (prisma.cohortMembership.findUnique as any).mockResolvedValue({
      id: MEMBERSHIP_ID,
      cohortId: 'cohort-1',
      studentId: 'student-1',
      cohort: { tutorId: TUTOR_ID },
    });
    (prisma.weeklyAssessment.findFirst as any).mockResolvedValue(null);
    (prisma.weeklyAssessment.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'assessment-1', ...data }),
    );

    const result = await submitAssessment(TUTOR_ID, {
      cohortMembershipId: MEMBERSHIP_ID,
      weekStartDate: '2026-09-01',
      tutorFeedback: 'Strong improvement on quadratic equations this week.',
    });

    expect(result.tutorFeedback).toBe('Strong improvement on quadratic equations this week.');
  });

  it('a duplicate for the same (cohortMembershipId, weekStartDate) is rejected with ApiError(409, ...)', async () => {
    (prisma.cohortMembership.findUnique as any).mockResolvedValue({
      id: MEMBERSHIP_ID,
      cohortId: 'cohort-1',
      studentId: 'student-1',
      cohort: { tutorId: TUTOR_ID },
    });
    (prisma.weeklyAssessment.findFirst as any).mockResolvedValue({
      id: 'assessment-existing',
      cohortMembershipId: MEMBERSHIP_ID,
      weekStartDate: '2026-09-01',
    });

    await expect(
      submitAssessment(TUTOR_ID, {
        cohortMembershipId: MEMBERSHIP_ID,
        weekStartDate: '2026-09-01',
        tutorFeedback: 'Another note.',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'An assessment for this week has already been submitted',
    });
  });

  it('a non-assigned tutor is rejected with a 403-class ApiError, verified before inserting', async () => {
    (prisma.cohortMembership.findUnique as any).mockResolvedValue({
      id: MEMBERSHIP_ID,
      cohortId: 'cohort-1',
      studentId: 'student-1',
      cohort: { tutorId: TUTOR_ID },
    });

    await expect(
      submitAssessment('some-other-tutor', {
        cohortMembershipId: MEMBERSHIP_ID,
        weekStartDate: '2026-09-01',
        tutorFeedback: 'Note.',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.weeklyAssessment.create).not.toHaveBeenCalled();
  });
});

describe.skip('getAssessmentsForStudent', () => {
  beforeEach(resetMocks);

  it('a party to the membership (student/parent/tutor) retrieves assessments', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({
      id: MEMBERSHIP_ID,
      cohortId: 'cohort-1',
      studentId: 'student-1',
      cohort: { tutorId: TUTOR_ID },
    });
    (prisma.weeklyAssessment.findMany as any).mockResolvedValue([
      {
        id: 'assessment-1',
        weekStartDate: '2026-09-01',
        scoreSummary: '82%',
        tutorFeedback: 'Strong improvement.',
        createdAt: new Date('2026-09-06T09:00:00Z'),
      },
    ]);

    const result = await getAssessmentsForStudent('student-1', MEMBERSHIP_ID);

    expect(result).toHaveLength(1);
  });

  it('a non-party is rejected (IDOR) with ApiError(403, "Not authorized to view these assessments")', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(null);

    await expect(getAssessmentsForStudent('unrelated-user', MEMBERSHIP_ID)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to view these assessments',
    });
  });

  it("no assessment yet for the current week resolves the list without that week's entry — not an error", async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({
      id: MEMBERSHIP_ID,
      cohortId: 'cohort-1',
      studentId: 'student-1',
      cohort: { tutorId: TUTOR_ID },
    });
    (prisma.weeklyAssessment.findMany as any).mockResolvedValue([
      {
        id: 'assessment-prior-week',
        weekStartDate: '2026-08-25',
        scoreSummary: '75%',
        tutorFeedback: 'Prior week note.',
        createdAt: new Date('2026-08-30T09:00:00Z'),
      },
    ]);

    const result = await getAssessmentsForStudent('student-1', MEMBERSHIP_ID);

    expect(result.find((a: any) => a.weekStartDate === '2026-09-01')).toBeUndefined();
    expect(result).toHaveLength(1);
  });
});
