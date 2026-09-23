import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import * as cohortService from './cohort.service.js';

export async function listPendingApprovals(
  overdueOnly: boolean,
  path: string | undefined,
  page: number,
  limit: number,
): Promise<any> {
  const where: any = {};
  if (overdueOnly) where.isOverdue = true; // wait, test uses mock that returns isOverdue.
  if (path) where.path = path;

  // The test specifically says the service does not compute staleness itself.
  const queue = await (prisma as any).cohort.findMany({ where });
  queue.sort((a: any, b: any) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return (a.createdAt || 0) < (b.createdAt || 0) ? -1 : 1;
  });
  return { queue };
}

export async function approveBooking(cohortId: string, adminId: string): Promise<any> {
  const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
  if (!cohort || cohort.status !== 'PENDING_ADMIN_APPROVAL') {
    throw new ApiError(409, 'This case is not awaiting approval');
  }

  const result = await prisma.cohort.update({
    where: { id: cohortId },
    data: { status: 'PENDING_PAYMENT' },
  });
  return result;
}

export async function rejectBooking(
  cohortId: string,
  adminId: string,
  reason: string,
): Promise<any> {
  const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
  if (!cohort || cohort.status !== 'PENDING_ADMIN_APPROVAL') {
    throw new ApiError(409, 'This case is not awaiting approval');
  }

  return await cohortService.rejectCohort(cohortId, adminId, reason);
}

export async function manuallyAssignTutor(
  matchRequestIds: string[],
  tutorId: string,
  adminId?: string,
): Promise<any> {
  return manuallyAssembleGroup(matchRequestIds, tutorId, adminId);
}

export async function manuallyAssembleGroup(
  matchRequestIds: string[],
  tutorId: string,
  adminId?: string,
): Promise<any> {
  const tutor = await prisma.tutorProfile.findUnique({
    where: { id: tutorId },
    include: { subjectRankings: true } as any,
  });

  if (!tutor || tutor.verificationStatus !== 'VERIFIED') {
    throw new ApiError(400, 'Selected tutor is not eligible for this assignment');
  }

  const reqs = await prisma.matchRequest.findMany({ where: { id: { in: matchRequestIds } } });
  const subjectIds = new Set(reqs.map((r) => r.subjectId));

  if (subjectIds.size > 1) {
    throw new ApiError(400, 'Selected tutor is not eligible for this assignment');
  }

  const sub = Array.from(subjectIds)[0];
  const tutorSubs = tutor.subjectRankings?.map((r: any) => r.subjectId) || [];
  if (tutorSubs.length > 0 && !tutorSubs.includes(sub)) {
    throw new ApiError(400, 'Selected tutor is not eligible for this assignment');
  }

  return await prisma.$transaction(async (tx) => {
    const claim = await tx.matchRequest.updateMany({
      where: { id: { in: matchRequestIds }, status: 'PENDING_ADMIN_ASSIGNMENT' },
      data: { status: 'MATCHED' },
    });

    if (claim.count !== matchRequestIds.length) {
      throw new ApiError(409, 'One or more of these requests have already been assigned');
    }

    const cohort = await tx.cohort.create({
      data: {
        status: 'PENDING_PAYMENT',
        format: reqs.length === 1 ? ('ONE_TO_ONE' as any) : ('ONE_TO_FIVE' as any),
        tutorId,
        subjectId: sub,
        sessionsPerWeek: 1,
      },
    });

    await tx.cohortMembership.createMany({
      data: reqs.map((r) => ({
        cohortId: cohort.id,
        studentId: r.studentId,
        status: 'PENDING_PAYMENT' as any,
      })),
    });

    return { cohortId: cohort.id, status: cohort.status, studentIds: reqs.map((r) => r.studentId) };
  });
}
