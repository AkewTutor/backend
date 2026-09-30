import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';

export async function submitAssessment(
  tutorId: string,
  data: {
    cohortMembershipId: string;
    weekStartDate: string;
    tutorFeedback: string;
    scoreSummary?: string;
  },
) {
  const { cohortMembershipId, weekStartDate, tutorFeedback, scoreSummary } = data;

  const membership = await prisma.cohortMembership.findUnique({
    where: { id: cohortMembershipId },
    include: { cohort: true },
  });

  if (!membership || membership.cohort.tutorId !== tutorId) {
    throw new ApiError(403, 'Not authorized');
  }

  const weekStart = new Date(weekStartDate);
  if (Number.isNaN(weekStart.getTime())) {
    throw new ApiError(400, 'weekStartDate must be a valid date');
  }

  const existing = await prisma.weeklyAssessment.findFirst({
    where: { cohortMembershipId, weekStartDate: weekStart },
  });

  if (existing) {
    throw new ApiError(409, 'An assessment for this week has already been submitted');
  }

  return prisma.weeklyAssessment.create({
    data: {
      cohortMembershipId,
      weekStartDate: weekStart,
      tutorFeedback,
      scoreSummary,
      submittedByTutorId: tutorId,
    },
  });
}

export async function getAssessmentsForStudent(callerId: string, cohortMembershipId: string) {
  const membership = await prisma.cohortMembership.findFirst({
    where: {
      id: cohortMembershipId,
      OR: [
        { studentId: callerId },
        { cohort: { tutorId: callerId } },
        { student: { guardianRelationships: { some: { parentId: callerId, status: 'ACTIVE' } } } },
      ],
    },
  });

  if (!membership) {
    throw new ApiError(403, 'Not authorized to view these assessments');
  }

  return prisma.weeklyAssessment.findMany({
    where: { cohortMembershipId },
  });
}
