import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { dispatchNotification } from './notification.service.js';
import { record as recordAuditLog } from './auditLog.service.js';

export async function listPendingTutors(page: number = 1, limit: number = 20) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    prisma.tutorProfile.findMany({
      where: { verificationStatus: 'PENDING' },
      skip,
      take: safeLimit,
      include: { user: true },
    }),
    prisma.tutorProfile.count({
      where: { verificationStatus: 'PENDING' },
    }),
  ]);

  return { items, page: safePage, limit: safeLimit, total };
}

export async function approveTutor(tutorId: string, adminId: string) {
  const tutor = await prisma.tutorProfile.findUnique({ where: { id: tutorId } });
  if (!tutor) throw new ApiError(404, 'Tutor not found');
  if (tutor.verificationStatus !== 'PENDING') {
    throw new ApiError(409, 'This tutor has already been reviewed');
  }

  const updated = await prisma.tutorProfile.update({
    where: { id: tutorId },
    data: {
      verificationStatus: 'VERIFIED',
      verifiedById: adminId,
      verifiedAt: new Date(),
    },
  });

  await dispatchNotification(updated.userId, 'TUTOR_VERIFICATION_APPROVED', { channel: 'EMAIL' });

  return updated;
}

export async function rejectTutor(tutorId: string, adminId: string, reason: string) {
  const tutor = await prisma.tutorProfile.findUnique({ where: { id: tutorId } });
  if (!tutor) throw new ApiError(404, 'Tutor not found');
  if (tutor.verificationStatus !== 'PENDING') {
    throw new ApiError(409, 'This tutor has already been reviewed');
  }

  const updated = await prisma.tutorProfile.update({
    where: { id: tutorId },
    data: {
      verificationStatus: 'REJECTED',
    },
  });

  await recordAuditLog({
    actor: adminId,
    action: 'TUTOR_REJECTED',
    target: tutorId,
    timestamp: new Date(),
  });

  await dispatchNotification(updated.userId, 'TUTOR_VERIFICATION_REJECTED', { channel: 'EMAIL' });

  return updated;
}
