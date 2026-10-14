// src/services/matching.service.ts
import { prisma } from '../config/db.js';
import { assertAccountStatusAllowsAccess } from './studentProfile.service.js';
import * as cohortService from './cohort.service.js';
import ApiError from '../utils/ApiError.js';

// Tutors are shown to students as "First L." (06-api/03 examples), never the full name.
function tutorDisplayName(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Tutor';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

type ExactMatch = { tutor: any; rank: number };

// Minutes of the student's preferred slots that overlap the tutor's availability.
function scheduleOverlapMinutes(preference: any[], tutorSlots: any[]) {
  let totalMinutes = 0;
  let overlapMinutes = 0;
  for (const sSlot of preference) {
    const sStart = new Date(sSlot.startTime).getTime();
    const sEnd = new Date(sSlot.endTime).getTime();
    totalMinutes += (sEnd - sStart) / 60000;
    for (const tSlot of tutorSlots) {
      const startMax = Math.max(sStart, new Date(tSlot.startTime).getTime());
      const endMin = Math.min(sEnd, new Date(tSlot.endTime).getTime());
      if (startMax < endMin) overlapMinutes += (endMin - startMax) / 60000;
    }
  }
  return { totalMinutes, overlapMinutes };
}

// The single definition of an "exact match", shared by search and recommendations
// (Doc 02 Section 8: hard filters first; a tutor who fails one is never scored).
//  1. Verified tutors who rank the subject 1st; only when there are none, 2nd (FR-TU-008).
//     With several subjects (subjects of interest) each subject is resolved on its own and
//     a tutor keeps the best rank they hold.
//  2. Day-of-week filter (recurring slots carry dayOfWeek, one-off slots only a start time).
//  3. Budget is a hard filter against the 1-to-1 price (price is per format, not per tutor).
//  4. If the student has a learning-schedule preference, the tutor needs an overlapping slot.
// NOTE: TutorProfile has no language column, so `language` is accepted but not applied.
// Grade never filters either (tutors teach Grades 1-12).
async function findExactMatchTutors(
  student: any,
  subjectIds: string[],
  query: any = {},
  withPrice = false,
): Promise<{ matches: ExactMatch[]; price: string | null }> {
  const include = {
    user: { select: { name: true } },
    availabilitySlots: true,
    subjectRankings: true,
  };
  const verified = { verificationStatus: 'VERIFIED' };
  const best = new Map<string, ExactMatch>();
  for (const subjectId of subjectIds) {
    let queryRank = 1;
    let found: any[] = await prisma.tutorProfile.findMany({
      where: { ...verified, subjectRankings: { some: { subjectId, rank: 1 } } },
      include,
    });
    if (found.length === 0) {
      queryRank = 2;
      found = await prisma.tutorProfile.findMany({
        where: { ...verified, subjectRankings: { some: { subjectId, rank: 2 } } },
        include,
      });
    }
    for (const tutor of found) {
      const entry = (tutor.subjectRankings ?? []).find((r: any) => r.subjectId === subjectId);
      const rank: number = entry?.rank ?? queryRank;
      const prev = best.get(tutor.id);
      if (!prev || rank < prev.rank) best.set(tutor.id, { tutor, rank });
    }
  }
  let matches: ExactMatch[] = [...best.values()];

  if (query.day !== undefined && query.day !== '' && !Number.isNaN(Number(query.day))) {
    const day = Number(query.day);
    matches = matches.filter(({ tutor }) =>
      (tutor.availabilitySlots ?? []).some(
        (slot: any) => (slot.dayOfWeek ?? new Date(slot.startTime).getUTCDay()) === day,
      ),
    );
  }

  // The price is only looked up when it is shown (search) or a budget has to be checked.
  const budgetRaw = query.budget ?? query.priceMax;
  const hasBudget = budgetRaw !== undefined && budgetRaw !== '';
  const pricing =
    withPrice || hasBudget
      ? await prisma.pricingConfig.findFirst({ where: { format: 'ONE_TO_ONE', isActive: true } })
      : null;
  const price = pricing ? pricing.pricePerStudentPerHour.toString() : null;
  if (price !== null && hasBudget) {
    const max = Number(budgetRaw);
    if (!Number.isNaN(max) && Number(price) > max) matches = [];
  }

  const preference: any[] = Array.isArray(student.learningSchedulePreference)
    ? student.learningSchedulePreference
    : [];
  if (preference.length > 0) {
    matches = matches.filter(
      ({ tutor }) =>
        scheduleOverlapMinutes(preference, tutor.availabilitySlots ?? []).overlapMinutes > 0,
    );
  }

  return { matches, price };
}

export async function searchOneToOneTutors(
  callerId: string,
  callerRole: string,
  overrideStudentId: string | undefined,
  query: any,
): Promise<any> {
  const studentId = query.studentId || callerId;
  const student = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  if (!student) throw new ApiError(404, 'Student not found');

  // An unset preference defaults to 1-to-1 search
  if (student.formatPreference && student.formatPreference !== 'ONE_TO_ONE') {
    throw new ApiError(
      400,
      'Search is only available for the 1-to-1 format — see /matching/group-format for 1-to-3/1-to-5',
    );
  }

  // Searching is read-only: the Path A request is created when the student acts
  // (selects a tutor or clicks "no exact match"), never as a side effect of a search.
  const { matches, price } = await findExactMatchTutors(student, [query.subjectId], query, true);

  return {
    tutors: matches.map(({ tutor: t }) => ({
      tutorId: t.id,
      name: tutorDisplayName(t.user?.name),
      profilePictureUrl: t.profilePictureUrl ?? null,
      verificationStatus: t.verificationStatus,
      pricePerStudentPerHour: price,
    })),
  };
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

  if (!activeRequest && targetSubjectId) {
    activeRequest = await prisma.matchRequest.create({
      data: {
        studentId: studentIdToUse,
        subjectId: targetSubjectId,
        format: 'ONE_TO_ONE',
        path: 'PATH_A',
        status: 'SEARCHING',
      },
    });
  }

  // With no explicit subject, fall back to the student's subjects of interest (FR-SP-008).
  const interestIds: string[] = Array.isArray(student.subjectsOfInterest)
    ? (student.subjectsOfInterest as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const subjectIds = targetSubjectId ? [targetSubjectId] : interestIds;

  // Nothing to match on (no subject, no open request, no subjects of interest): do not list
  // every tutor at a meaningless 100%; tell the client to ask for the profile instead.
  if (subjectIds.length === 0) {
    return { matchRequestId: null, zeroMatchSince: null, recommendations: [], needsProfile: true };
  }

  // Same candidate set as search; recommendations only add the score on top.
  const { matches } = await findExactMatchTutors(student, subjectIds, query ?? {});

  const recommendations = matches
    .map(({ tutor, rank }) => {
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
      const preference: any[] = Array.isArray(student.learningSchedulePreference)
        ? student.learningSchedulePreference
        : [];
      if (preference.length > 0) {
        const { totalMinutes, overlapMinutes } = scheduleOverlapMinutes(
          preference,
          tutor.availabilitySlots || [],
        );
        if (totalMinutes > 0) {
          scheduleScore = Math.min(100, (overlapMinutes / totalMinutes) * 100);
        }
      }

      const finalScore = 0.4 * subjectScore + 0.35 * styleScore + 0.25 * scheduleScore;

      return {
        tutorId: tutor.id,
        name: tutorDisplayName(tutor.user?.name),
        profilePictureUrl: tutor.profilePictureUrl ?? null,
        matchPercentage: Math.round(finalScore),
      };
    })
    .sort((a: any, b: any) => b.matchPercentage - a.matchPercentage)
    .slice(0, 15);

  return {
    matchRequestId: activeRequest?.id ?? null,
    zeroMatchSince: activeRequest?.zeroMatchSince ?? null,
    recommendations,
  };
}

export async function selectTutor(
  callerId: string,
  callerRole: string,
  overrideStudentId: string | undefined,
  tutorId: string,
  requestedSubjectId?: string,
): Promise<any> {
  const studentId = callerRole === 'STUDENT' ? callerId : overrideStudentId || callerId;
  await assertAccountStatusAllowsAccess(studentId);

  const tutor: any = await prisma.tutorProfile.findUnique({
    where: { id: tutorId },
    include: { subjectRankings: true },
  });
  if (!tutor || tutor.verificationStatus !== 'VERIFIED') {
    throw new ApiError(400, 'Selected tutor is not eligible');
  }

  // Subject of the new cohort, in order: the one sent by the client, the open Path A request
  // (resolved below), then the tutor's best-ranked subject among the student's interests.
  const student: any = await prisma.studentProfile.findUnique({ where: { id: studentId } });
  const interestIds: string[] = Array.isArray(student?.subjectsOfInterest)
    ? (student.subjectsOfInterest as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const interestSubjectId: string | undefined = (tutor.subjectRankings ?? [])
    .filter((r: any) => interestIds.includes(r.subjectId))
    .sort((a: any, b: any) => a.rank - b.rank)[0]?.subjectId;

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

      // The student's own Path A search (created by search/recommendations) is the very
      // request this selection resolves; any other in-flight request blocks a new match.
      const existingMatch = await tx.matchRequest.findFirst({
        where: {
          studentId,
          OR: [
            { status: 'PENDING_ADMIN_ASSIGNMENT' },
            { status: 'SEARCHING', NOT: { path: 'PATH_A' } },
          ],
        },
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

      const searchRequest = await tx.matchRequest.findFirst({
        where: { studentId, path: 'PATH_A', status: 'SEARCHING' },
        orderBy: { createdAt: 'desc' },
      });

      const cohortSubjectId = requestedSubjectId ?? searchRequest?.subjectId ?? interestSubjectId;
      if (!cohortSubjectId) {
        throw new ApiError(400, 'Choose a subject first');
      }

      // Pass `tx` to the cohort service so the cohort + membership writes
      // enlist in this transaction and on this connection. Without it,
      // the FK check on the nested CohortMembership insert blocks against
      // the `FOR UPDATE` lock this transaction holds on StudentProfile,
      // and Prisma's interactive-transaction timeout fires at 5s.
      const cohort = await cohortService.createOneToOneCohort(
        studentId,
        tutorId,
        tx,
        cohortSubjectId,
      );

      if (searchRequest) {
        await tx.matchRequest.update({
          where: { id: searchRequest.id },
          data: { status: 'MATCHED', tutorId, resultingCohortId: cohort.cohortId },
        });
      } else {
        // Selected straight from search results (no request yet): record the resolved match.
        await tx.matchRequest.create({
          data: {
            studentId,
            subjectId: cohortSubjectId,
            format: 'ONE_TO_ONE',
            path: 'PATH_A',
            status: 'MATCHED',
            tutorId,
            resultingCohortId: cohort.cohortId,
          },
        });
      }
      return cohort;
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
  subjectId?: string,
): Promise<any> {
  const studentId = callerRole === 'STUDENT' ? callerId : overrideStudentId || callerId;
  await assertAccountStatusAllowsAccess(studentId);

  let matchReq = await prisma.matchRequest.findFirst({
    where: { studentId, status: { in: ['SEARCHING', 'PENDING_ADMIN_ASSIGNMENT'] } },
  });

  if (matchReq && matchReq.status === 'PENDING_ADMIN_ASSIGNMENT') {
    throw new ApiError(409, 'You already have a pending or active match');
  }

  if (!matchReq) {
    if (!subjectId) {
      throw new ApiError(400, 'subjectId is required when there is no search in progress');
    }
    matchReq = await prisma.matchRequest.create({
      data: {
        studentId,
        subjectId,
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

  if (!subjectId) {
    throw new ApiError(400, 'subjectId is required');
  }

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
  // "In progress" excludes requests that are already resolved (MATCHED) or withdrawn.
  const matchReq = await prisma.matchRequest.findFirst({
    where: { studentId, status: { notIn: ['CANCELLED', 'MATCHED'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (!matchReq) {
    throw new ApiError(404, 'No match request in progress');
  }

  return {
    id: matchReq.id,
    subjectId: matchReq.subjectId,
    format: matchReq.format,
    path: matchReq.path,
    status: matchReq.status,
    zeroMatchSince: matchReq.zeroMatchSince ?? null,
    resultingCohortId: matchReq.resultingCohortId ?? null,
  };
}

export async function getTutorDetail(
  tutorId: string,
  callerId: string,
  callerRole: string,
): Promise<any> {
  const tutor: any = await prisma.tutorProfile.findUnique({
    where: { id: tutorId },
    include: {
      user: { select: { name: true } },
      subjectRankings: { include: { subject: true }, orderBy: { rank: 'asc' } },
      availabilitySlots: { orderBy: { startTime: 'asc' } },
    },
  });
  if (!tutor || tutor.verificationStatus !== 'VERIFIED') {
    throw new ApiError(404, 'Tutor not found');
  }

  const uniqueStudents = await prisma.cohortMembership.groupBy({
    by: ['studentId'],
    where: { cohort: { tutorId } },
  });

  return {
    tutorId: tutor.id,
    name: tutorDisplayName(tutor.user?.name),
    profilePictureUrl: tutor.profilePictureUrl ?? null,
    verificationStatus: tutor.verificationStatus,
    educationInstitution: tutor.educationInstitution ?? null,
    // Optional fields are omitted when unset (06-api/03).
    ...(tutor.degree ? { degree: tutor.degree } : {}),
    // Tutors are not restricted by grade (TutorProfile has no grade column): Grades 1-12.
    subjectsAndGrades: (tutor.subjectRankings ?? [])
      .filter((r: any) => r.subject?.name)
      .map((r: any) => ({ subjectName: r.subject.name, grades: '1-12' })),
    uniqueStudentsTaught: uniqueStudents.length,
    availableSlots: (tutor.availabilitySlots ?? []).map((slot: any) => ({
      startTime: new Date(slot.startTime).toISOString(),
      endTime: new Date(slot.endTime).toISOString(),
    })),
  };
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
