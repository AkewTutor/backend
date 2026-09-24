import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { generateMakeupSession } from './session.service.js';

export async function recordTutorCausedMiss(sessionId: string, missType: string) {
  const existing = await prisma.sessionMiss.findUnique({ where: { sessionId } });
  if (existing) {
    throw new ApiError(409, 'A miss has already been recorded for this session');
  }

  const session = await prisma.scheduledSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new ApiError(404, 'Session not found');

  const makeup = await generateMakeupSession(sessionId);

  const miss = await prisma.sessionMiss.create({
    data: {
      sessionId,
      causedBy: 'TUTOR',
      missType: missType as any,
      makeupSessionId: makeup.id,
    },
  });

  const makeupDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return {
    ...miss,
    makeupDeadline,
    tutorEarningRateForMakeup: 'REDUCED_MAKEUP',
  };
}

export async function recordStudentCausedMiss(sessionId: string, missType: string) {
  const existing = await prisma.sessionMiss.findUnique({ where: { sessionId } });
  if (existing) {
    throw new ApiError(409, 'A miss has already been recorded for this session');
  }

  const session = await prisma.scheduledSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new ApiError(404, 'Session not found');

  const miss = await prisma.sessionMiss.create({
    data: {
      sessionId,
      causedBy: 'STUDENT',
      missType: missType as any,
    },
  });

  return {
    ...miss,
    tutorEarningRateForOriginalSession: 'FULL',
    makeupSessionId: null,
  };
}

export async function checkTutorEscalation(tutorId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const misses = await prisma.sessionMiss.findMany({
    where: {
      causedBy: 'TUTOR',
      session: { cohort: { tutorId } },
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  const validMisses = misses.filter(
    (m: any) => m.causedBy === 'TUTOR' && m.createdAt >= thirtyDaysAgo,
  );

  return validMisses.length >= 2;
}

export async function listMisses(filters: any, options?: any) {
  const where: any = {};
  if (filters.tutorId) {
    where.session = { tutorId: filters.tutorId };
  }

  const misses = await prisma.sessionMiss.findMany({ where });
  const escalationFlag = filters.tutorId ? await checkTutorEscalation(filters.tutorId) : false;

  return {
    misses,
    escalationFlag,
    page: 1,
    limit: 20,
    total: misses.length,
  };
}
