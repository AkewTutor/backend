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

const ESCALATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const ESCALATION_THRESHOLD = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Every tutor currently escalated (2+ TUTOR-caused misses in a rolling 30-day window).
 * Computed at query time; independent of any causedBy filter or pagination.
 */
export async function listEscalatedTutorIds(): Promise<string[]> {
  const since = new Date(Date.now() - ESCALATION_WINDOW_MS);
  const misses = await prisma.sessionMiss.findMany({
    where: { causedBy: 'TUTOR', createdAt: { gte: since } },
    select: { session: { select: { cohort: { select: { tutorId: true } } } } },
  });

  const counts = new Map<string, number>();
  for (const m of misses as any[]) {
    const tutorId = m.session?.cohort?.tutorId as string | undefined;
    if (tutorId) counts.set(tutorId, (counts.get(tutorId) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= ESCALATION_THRESHOLD).map(([id]) => id);
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/**
 * filters.tutorId set  -> one tutor's record (Tutor caller, or Admin filtering): escalationFlag boolean, escalatedTutorIds [].
 * filters.tutorId unset -> Admin list of all tutors: escalationFlag null, escalatedTutorIds = all escalated tutors.
 */
export async function listMisses(filters: any = {}) {
  const tutorId: string | undefined = filters.tutorId || undefined;
  const causedBy: string | undefined = filters.causedBy || undefined;
  if (causedBy && causedBy !== 'TUTOR' && causedBy !== 'STUDENT') {
    throw new ApiError(400, 'causedBy must be TUTOR or STUDENT');
  }

  const page = toPositiveInt(filters.page, 1);
  const limit = Math.min(toPositiveInt(filters.limit, DEFAULT_LIMIT), MAX_LIMIT);

  const where: any = {};
  if (tutorId) where.session = { cohort: { tutorId } };
  if (causedBy) where.causedBy = causedBy;

  const [rows, total] = await Promise.all([
    prisma.sessionMiss.findMany({
      where,
      include: { session: { select: { cohort: { select: { tutorId: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.sessionMiss.count({ where }),
  ]);

  const misses = (rows as any[]).map(({ session, ...miss }) => ({
    ...miss,
    tutorId: session?.cohort?.tutorId ?? null,
  }));

  const escalationFlag = tutorId ? await checkTutorEscalation(tutorId) : null;
  const escalatedTutorIds = tutorId ? [] : await listEscalatedTutorIds();

  return { misses, escalationFlag, escalatedTutorIds, page, limit, total };
}
