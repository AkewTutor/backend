import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';

/**
 * AvailabilitySlot.tutorId is a FK to TutorProfile.id, but callers hold a
 * User id (req.user.id). Always resolve the profile first.
 */
async function profileIdFor(userId: string): Promise<string> {
  const profile = await prisma.tutorProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) {
    throw new ApiError(403, 'Tutor profile not found');
  }
  return profile.id;
}

export async function setSlots(
  userId: string,
  input: { dayOfWeek?: number; startTime: Date; endTime: Date; isRecurring: boolean },
) {
  if (new Date(input.endTime) <= new Date(input.startTime)) {
    throw new ApiError(400, 'End time must be after start time');
  }
  const tutorId = await profileIdFor(userId);
  return prisma.availabilitySlot.create({
    data: {
      tutorId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      isRecurring: input.isRecurring,
    },
  });
}

export async function listSlots(userId: string) {
  const tutorId = await profileIdFor(userId);
  return prisma.availabilitySlot.findMany({
    where: { tutorId },
  });
}

const minutesOfDay = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();

export async function removeSlot(userId: string, slotId: string) {
  const tutorId = await profileIdFor(userId);

  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: slotId },
  });
  if (!slot || slot.tutorId !== tutorId) {
    throw new ApiError(403, 'Not authorized to remove this slot');
  }

  // ScheduledSession has no slotId/tutorId/CONFIRMED status, so "in use" means:
  // an upcoming SCHEDULED session in one of this tutor's cohorts overlaps the slot.
  const upcoming = await prisma.scheduledSession.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledStart: { gte: new Date() },
      cohort: { tutorId },
    },
    select: { scheduledStart: true, scheduledEnd: true },
  });

  const inUse = upcoming.some((s) =>
    slot.isRecurring
      ? // recurring: same weekday (JS convention 0=Sunday) and overlapping time of day
        s.scheduledStart.getUTCDay() === slot.dayOfWeek &&
        minutesOfDay(s.scheduledStart) < minutesOfDay(slot.endTime) &&
        minutesOfDay(s.scheduledEnd) > minutesOfDay(slot.startTime)
      : // one-off: plain datetime overlap
        s.scheduledStart < slot.endTime && s.scheduledEnd > slot.startTime,
  );

  if (inUse) {
    throw new ApiError(
      409,
      'This slot is in use by a confirmed session and cannot be removed until it is resolved',
    );
  }

  await prisma.availabilitySlot.delete({
    where: { id: slotId },
  });
  return { id: slotId, deleted: true };
}
