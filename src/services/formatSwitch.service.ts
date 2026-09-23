import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import * as matchingService from './matching.service.js';
import * as refundService from './refund.service.js';
import { dispatchNotification } from './notification.service.js';

export async function requestSwitch(
  callerId: string,
  callerRole: string,
  overrideStudentId: string | undefined,
  toFormat: string,
): Promise<any> {
  const studentId = overrideStudentId || callerId;

  const membership = await prisma.cohortMembership.findFirst({
    where: { studentId, status: 'ACTIVE' },
    include: { cohort: true },
  });

  if (!membership) {
    throw new ApiError(409, 'No active assignment to switch from');
  }

  if (membership.cohort.format === toFormat) {
    throw new ApiError(400, 'You are already in this format');
  }

  const payment = await (prisma as any).payment.findFirst({
    where: { studentId } as any, // mocked in tests
  });

  await prisma.cohortMembership.update({
    where: { id: membership.id },
    data: { status: 'ENDED', endReason: 'FORMAT_SWITCH' as any, endedAt: new Date() },
  });

  await prisma.formatSwitchRequest.create({
    data: {
      studentId,
      fromMembershipId: membership.id,
      fromFormat: membership.cohort.format,
      toFormat: toFormat as any,
    },
  });

  let refundId = null;
  if (payment && (payment as any).sessionsRemaining > 0) {
    const refund = await refundService.createPendingRefund(payment.id, 'FORMAT_SWITCH');
    refundId = refund ? refund.id : null;
  }

  dispatchNotification(membership.cohort.tutorId, 'FORMAT_SWITCH' as any, {
    message: 'student switched format',
  });

  const mr = await matchingService.createMatchRequestForFormat({
    studentId,
    subjectId: membership.cohort.subjectId,
    toFormat,
  });

  return {
    oldMembershipStatus: 'ENDED',
    newMatchRequestId: mr.id,
    refundId,
  };
}
