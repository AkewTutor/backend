import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import * as cohortService from './cohort.service.js';
import { dispatchNotification } from './notification.service.js';

export async function listPendingApprovals(
  overdueOnly: boolean,
  path: string | undefined,
  page: number,
  limit: number,
): Promise<any> {
  // Only cohorts that are actually waiting on an admin belong in the queue.
  const where: any = { status: 'PENDING_ADMIN_APPROVAL' };
  if (overdueOnly) where.adminOverdueNotifiedAt = { not: null };
  // Cohort has no `path` column: Path A is 1-to-1, Path C is any group format.
  if (path === 'PATH_A') where.format = 'ONE_TO_ONE';
  else if (path === 'PATH_C') where.format = { not: 'ONE_TO_ONE' };
  else if (path) where.id = { in: [] };

  const rows = await (prisma as any).cohort.findMany({
    where,
    include: {
      memberships: true,
      tutor: { include: { user: { select: { email: true } } } },
    },
  });

  // Reads the stored overdue flag; never computes staleness itself.
  const items = rows.map((row: any) => {
    const { memberships, tutor, ...rest } = row;
    return {
      ...rest,
      cohortId: row.cohortId ?? row.id,
      path: row.path ?? (row.format === 'ONE_TO_ONE' ? 'PATH_A' : 'PATH_C'),
      tutorEmail: row.tutorEmail ?? tutor?.user?.email ?? null,
      studentIds: row.studentIds ?? (memberships ?? []).map((m: any) => m.studentId),
      isOverdue: row.isOverdue ?? row.adminOverdueNotifiedAt != null,
    };
  });
  items.sort((a: any, b: any) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return (a.createdAt || 0) < (b.createdAt || 0) ? -1 : 1;
  });

  const start = (page - 1) * limit;
  return { queue: items.slice(start, start + limit), page, limit, total: items.length };
}

export async function approveBooking(cohortId: string, adminId: string): Promise<any> {
  const cohort: any = await prisma.cohort.findUnique({
    where: { id: cohortId },
    include: { memberships: true },
  });
  if (!cohort || cohort.status !== 'PENDING_ADMIN_APPROVAL') {
    throw new ApiError(409, 'This case is not awaiting approval');
  }

  const result = await prisma.cohort.update({
    where: { id: cohortId },
    data: { status: 'PENDING_PAYMENT', adminApprovedById: adminId },
  });

  // Tell every member their match was approved and payment is next.
  for (const membership of cohort.memberships ?? []) {
    const student = await prisma.studentProfile.findUnique({ where: { id: membership.studentId } });
    if (student?.userId) {
      await dispatchNotification(student.userId, 'MATCH_FOUND', { cohortId });
    }
  }
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
