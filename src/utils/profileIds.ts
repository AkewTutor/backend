import { prisma } from '../config/db.js';

/**
 * JWT `user.id` is the USER id, but the matching / cohort / format-switch
 * services key everything on the role PROFILE id (StudentProfile.id or
 * TutorProfile.id). Resolve once at the controller boundary.
 * Other roles (ADMIN, PARENT) pass through unchanged.
 */
export async function resolveCallerProfileId(user: { id: string; role: string }): Promise<string> {
  if (user.role === 'STUDENT') {
    const p = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    return p?.id ?? user.id;
  }
  if (user.role === 'TUTOR') {
    const p = await prisma.tutorProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    return p?.id ?? user.id;
  }
  return user.id;
}
