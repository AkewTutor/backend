import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';

/**
 * Throws unless the caller may act for this membership: the student themself, or a parent
 * with an ACTIVE relationship to that student. Same rule as payment initiation.
 * `callerId` is the JWT user id (not a profile id).
 */
export async function assertCanAccessMembership(
  callerId: string,
  callerRole: string,
  cohortMembershipId: string,
): Promise<void> {
  const membership = await prisma.cohortMembership.findUnique({
    where: { id: cohortMembershipId },
    include: { student: true },
  });
  if (!membership) throw new ApiError(404, 'CohortMembership not found');

  if (callerRole === 'STUDENT') {
    if (membership.student.userId !== callerId) {
      throw new ApiError(403, 'Insufficient permissions for this student');
    }
    return;
  }

  if (callerRole === 'PARENT') {
    const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: callerId } });
    const rel = parentProfile
      ? await prisma.parentStudentRelationship.findFirst({
          where: {
            parentId: parentProfile.id,
            studentId: membership.studentId,
            status: 'ACTIVE',
          },
        })
      : null;
    if (!rel) throw new ApiError(403, 'Insufficient permissions for this student');
    return;
  }

  throw new ApiError(403, 'Insufficient permissions for this student');
}
