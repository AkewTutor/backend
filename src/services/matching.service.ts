// src/services/matching.service.ts
import { prisma } from '../config/db.js';
import { assertAccountStatusAllowsAccess } from './studentProfile.service.js';
import * as cohortService from './cohort.service.js';
import ApiError from '../utils/ApiError.js';

export async function searchOneToOneTutors(
  callerId: string,
  callerRole: string,
  overrideStudentId: string | undefined,
  query: any,
): Promise<any> {
  const studentId = query.studentId || callerId;
  const student = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  if (!student) throw new ApiError(404, 'Student not found');

  if (student.formatPreference !== 'ONE_TO_ONE') {
    throw new ApiError(
      400,
      'Search is only available for the 1-to-1 format — see /matching/group-format for 1-to-3/1-to-5',
    );
  }

  let filter: any = { verificationStatus: 'VERIFIED' };

  if (query.budget) filter.pricePerStudentPerHour = { lte: query.budget };
  if (query.priceMax) filter.pricePerStudentPerHour = { lte: query.priceMax };
  if (query.language) filter.teachingLanguage = query.language;

  let tutors = await prisma.tutorProfile.findMany({
    where: {
      ...filter,
      subjectRankings: {
        some: {
          subjectId: query.subjectId,
          rank: 1,
          ...(query.grade !== undefined ? { grade: query.grade } : {}),
        },
      },
    },
  });

  if (tutors.length === 0) {
    tutors = await prisma.tutorProfile.findMany({
      where: {
        ...filter,
        subjectRankings: {
          some: {
            subjectId: query.subjectId,
            rank: 2,
            ...(query.grade !== undefined ? { grade: query.grade } : {}),
          },
        },
      },
    });
  }

  return { tutors: tutors.map((t: any) => ({ tutorId: t.id, ...t })) };
}

export async function recommendTutorsWithMatchPercent(
  studentIdToUse: string,
  callerRole: string,
  overrideStudentId?: string,
  query?: any,
): Promise<any> {
  const student = await prisma.studentProfile.findUnique({ where: { id: studentIdToUse } });
  if (!student) throw new ApiError(404, 'Student not found');

  let activeRequest = await prisma.matchRequest.findFirst({
    where: { studentId: studentIdToUse, status: { in: ['SEARCHING', 'ZERO_MATCH_PENDING'] } },
  });

  const targetSubjectId = query?.subjectId || activeRequest?.subjectId;

  if (!activeRequest) {
    activeRequest = await prisma.matchRequest.create({
      data: {
        studentId: studentIdToUse,
        subjectId: targetSubjectId || 'dummy-subject',
        format: 'ONE_TO_ONE',
        path: 'PATH_A',
        status: 'SEARCHING',
      },
    });
  }

  let filter: any = { verificationStatus: 'VERIFIED' };
  if (student.preferredLanguage) filter.teachingLanguage = student.preferredLanguage;
  if (student.budgetPreference) filter.pricePerStudentPerHour = { lte: student.budgetPreference };

  let whereClause: any = { ...filter };
  if (targetSubjectId) {
    whereClause.subjectRankings = { some: { subjectId: targetSubjectId } };
  }

  let allTutors = await prisma.tutorProfile.findMany({
    where: whereClause,
    include: { subjectRankings: true },
  });

  const recommendations = allTutors
    .map((tutor: any) => {
      const actualSubjectId =
        targetSubjectId || (tutor.subjectRankings && tutor.subjectRankings[0]?.subjectId);
      const rankEntry = tutor.subjectRankings?.find((r: any) => r.subjectId === actualSubjectId);
      const rank = rankEntry ? rankEntry.rank : 3;

      let subjectScore = 0;
      if (rank === 1) subjectScore = 100;
      else if (rank === 2) subjectScore = 70;

      let styleScore = 100;
      if (
        student.teachingStylePreference &&
        tutor.teachingStyle !== student.teachingStylePreference
      ) {
        styleScore = 40;
      }

      let scheduleScore = 100;
      if (
        student.learningSchedulePreference &&
        Array.isArray(student.learningSchedulePreference) &&
        student.learningSchedulePreference.length > 0
      ) {
        const studentTotalMinutes = student.learningSchedulePreference.reduce(
          (acc: number, slot: any) => {
            return (
              acc + (new Date(slot.endTime).getTime() - new Date(slot.startTime).getTime()) / 60000
            );
          },
          0,
        );

        let overlapMinutes = 0;
        const tutorSlots = tutor.availabilitySlots || [];
        for (const sSlot of student.learningSchedulePreference) {
          const sStart = new Date((sSlot as any).startTime).getTime();
          const sEnd = new Date((sSlot as any).endTime).getTime();

          for (const tSlot of tutorSlots) {
            const tStart = new Date((tSlot as any).startTime).getTime();
            const tEnd = new Date((tSlot as any).endTime).getTime();

            const startMax = Math.max(sStart, tStart);
            const endMin = Math.min(sEnd, tEnd);
            if (startMax < endMin) {
              overlapMinutes += (endMin - startMax) / 60000;
            }
          }
        }

        if (studentTotalMinutes > 0) {
          scheduleScore = Math.min(100, (overlapMinutes / studentTotalMinutes) * 100);
        }
      }

      const finalScore = 0.4 * subjectScore + 0.35 * styleScore + 0.25 * scheduleScore;
      const matchPercentage = Math.round(finalScore);

      return { tutorId: tutor.id, matchPercentage, ...tutor };
    })
    .sort((a: any, b: any) => b.matchPercentage - a.matchPercentage)
    .slice(0, 15);

  return {
    matchRequestId: activeRequest.id,
    zeroMatchSince: activeRequest.zeroMatchSince,
    recommendations,
  };
}

export async function selectTutor(
  callerId: string,
  callerRole: string,
  overrideStudentId: string | undefined,
  tutorId: string,
): Promise<any> {
  const studentId = callerRole === 'STUDENT' ? callerId : overrideStudentId || callerId;
  await assertAccountStatusAllowsAccess(studentId);

  try {
    return await prisma.$transaction(async (tx) => {
      // Lock student to prevent concurrent double-booking
      await tx.$queryRaw`SELECT * FROM "StudentProfile" WHERE id = ${studentId} FOR UPDATE`;

      const exclusion = await tx.tutorExclusion.findUnique({
        where: { studentId_tutorId: { studentId, tutorId } },
      });
      if (exclusion) {
        throw new ApiError(
          400,
          'This tutor is not available — please choose from your current recommendations',
        );
      }

      const existingMatch = await tx.matchRequest.findFirst({
        where: { studentId, status: { in: ['SEARCHING', 'PENDING_ADMIN_ASSIGNMENT'] } },
      });
      if (existingMatch) {
        throw new ApiError(409, 'You already have a pending or active match');
      }
      const existingMembership = await tx.cohortMembership.findFirst({
        where: { studentId, status: { not: 'ENDED' } },
      });
      if (existingMembership) {
        throw new ApiError(409, 'You already have a pending or active match');
      }

      // Pass `tx` to the cohort service so the cohort + membership writes
      // enlist in this transaction and on this connection. Without it,
      // the FK check on the nested CohortMembership insert blocks against
      // the `FOR UPDATE` lock this transaction holds on StudentProfile,
      // and Prisma's interactive-transaction timeout fires at 5s.
      return await cohortService.createOneToOneCohort(studentId, tutorId, tx);
    });
  } catch (e: any) {
    if (e.code === 'P2003') {
      throw new ApiError(400, 'Invalid tutorId');
    }
    throw e;
  }
}

export async function triggerNoExactMatch(
  callerId: string,
  callerRole: string,
  overrideStudentId?: string,
): Promise<any> {
  const studentId = callerRole === 'STUDENT' ? callerId : overrideStudentId || callerId;
  await assertAccountStatusAllowsAccess(studentId);

  let matchReq = await prisma.matchRequest.findFirst({
    where: { studentId, status: 'SEARCHING' },
  });

  if (!matchReq) {
    matchReq = await prisma.matchRequest.create({
      data: {
        studentId,
        subjectId: 'dummy-subject',
        format: 'ONE_TO_ONE',
        path: 'PATH_B',
        status: 'PENDING_ADMIN_ASSIGNMENT',
      },
    });
  } else {
    matchReq = await prisma.matchRequest.update({
      where: { id: matchReq.id },
      data: { status: 'PENDING_ADMIN_ASSIGNMENT', path: 'PATH_B' },
    });
  }

  return { matchRequestId: matchReq.id, status: matchReq.status };
}

export async function requestGroupFormat(
  callerId: string,
  callerRole: string,
  overrideStudentId: string | undefined,
  subjectId: string,
): Promise<any> {
  const studentId = callerRole === 'STUDENT' ? callerId : overrideStudentId || callerId;
  await assertAccountStatusAllowsAccess(studentId);

  const student = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  if (student?.formatPreference === 'ONE_TO_ONE') {
    throw new ApiError(
      400,
      'Use /matching/select-tutor or /matching/no-exact-match for the 1-to-1 format',
    );
  }

  const matchReq = await prisma.matchRequest.create({
    data: {
      studentId,
      subjectId,
      format: student?.formatPreference || 'ONE_TO_THREE',
      path: 'PATH_C',
      status: 'SEARCHING',
    },
  });

  return { matchRequestId: matchReq.id, status: matchReq.status };
}

export async function getMyRequestStatus(
  callerId: string,
  callerRole: string,
  overrideStudentId?: string,
): Promise<any> {
  const studentId = callerRole === 'STUDENT' ? callerId : overrideStudentId || callerId;
  const matchReq = await prisma.matchRequest.findFirst({
    where: { studentId, status: { not: 'CANCELLED' } },
  });

  if (!matchReq) {
    throw new ApiError(404, 'No match request in progress');
  }

  return { status: matchReq.status };
}

export async function getTutorDetail(
  tutorId: string,
  callerId: string,
  callerRole: string,
): Promise<any> {
  const tutor = await prisma.tutorProfile.findUnique({ where: { id: tutorId } });
  if (!tutor || tutor.verificationStatus !== 'VERIFIED') {
    throw new ApiError(404, 'Tutor not found');
  }

  const uniqueStudents = await prisma.cohortMembership.groupBy({
    by: ['studentId'],
    where: { cohort: { tutorId } },
  });

  return { ...tutor, uniqueStudentsTaught: uniqueStudents.length };
}

export async function createMatchRequestForFormat(params: {
  studentId: string;
  subjectId: string;
  toFormat: string;
}) {
  const path = params.toFormat === 'ONE_TO_ONE' ? 'PATH_A' : 'PATH_C';
  return await prisma.matchRequest.create({
    data: {
      studentId: params.studentId,
      subjectId: params.subjectId,
      format: params.toFormat as any,
      path: path as any,
      status: 'SEARCHING',
    },
  });
}
