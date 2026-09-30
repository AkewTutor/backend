import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { recordStudentCausedMiss, recordTutorCausedMiss } from './sessionMiss.service.js';

/**
 * A recurring AvailabilitySlot repeats weekly: the weekday and time-of-day (UTC) of its
 * startTime/endTime define the window (same convention generateSessionsForCohort uses).
 * Slots without usable start/end times cannot be evaluated and are treated as open.
 */
function fitsAnySlot(
  slots: Array<{ startTime?: Date | string | null; endTime?: Date | string | null }>,
  requested: Date,
): boolean {
  if (Number.isNaN(requested.getTime())) return false;
  const minutesOfDay = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
  const reqDay = requested.getUTCDay();
  const reqMin = minutesOfDay(requested);

  return slots.some((slot) => {
    if (!slot.startTime || !slot.endTime) return true;
    const start = new Date(slot.startTime);
    const end = new Date(slot.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
    return (
      start.getUTCDay() === reqDay && reqMin >= minutesOfDay(start) && reqMin < minutesOfDay(end)
    );
  });
}

export async function enforceMonthlyCap(callerId: string) {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const count = await prisma.rescheduleRequest.count({
    where: {
      requestedById: callerId,
      createdAt: { gte: startOfMonth },
    },
  });

  if (count >= 2) {
    throw new ApiError(
      409,
      'Free reschedule limit reached for this month — further changes require Admin review',
    );
  }

  return { freeReschedulesUsedThisMonth: count };
}

export async function requestReschedule(
  callerId: string,
  sessionId: string,
  requestedNewStart: Date,
) {
  const session = await prisma.scheduledSession.findUnique({
    where: { id: sessionId },
    include: { cohort: true },
  });
  if (!session) throw new ApiError(404, 'Session not found');

  const actualTutorId = (session as any).cohort?.tutorId || (session as any).tutorId;
  const now = new Date();
  const noticeMs = session.scheduledStart.getTime() - now.getTime();
  const noticeHours = noticeMs / (1000 * 60 * 60);

  if (noticeHours < 12) {
    if (callerId === actualTutorId) {
      await recordTutorCausedMiss(sessionId, 'LATE_CANCELLATION');
    } else {
      await recordStudentCausedMiss(sessionId, 'LATE_CANCELLATION');
    }
    return { classification: 'SAME_DAY_MISS' as const };
  }

  const slots = await prisma.availabilitySlot.findMany({
    where: { tutorId: actualTutorId, isRecurring: true },
  });
  if (slots.length === 0 || !fitsAnySlot(slots, requestedNewStart)) {
    throw new ApiError(400, "Requested time is outside the tutor's availability");
  }

  await enforceMonthlyCap(callerId);

  const request = await prisma.rescheduleRequest.create({
    data: {
      sessionId,
      requestedById: callerId,
      requestedNewStart,
      noticeHours,
      classification: 'FREE_RESCHEDULE',
    },
  });

  await prisma.scheduledSession.update({
    where: { id: sessionId },
    data: { scheduledStart: requestedNewStart },
  });

  return request;
}
