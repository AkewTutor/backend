import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { record as recordAuditLog } from './auditLog.service.js';
import { Prisma, RefundReason } from '@prisma/client';

export async function calculateProration(paymentId: string, reason: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { cohortMembership: { include: { cohort: true } } },
  });

  if (!payment) {
    throw new ApiError(404, 'Payment not found');
  }

  const sessionsPerWeek = payment.cohortMembership.cohort.sessionsPerWeek!;
  const totalSessionsBilled = sessionsPerWeek * 4;

  const sessionsRemaining = await prisma.scheduledSession.count({
    where: {
      cohortId: payment.cohortMembership.cohort.id,
      scheduledStart: {
        gte: payment.billingPeriodStart,
        lt: payment.billingPeriodEnd,
      },
      isMakeup: false,
      status: { not: 'COMPLETED' },
    },
  });

  // Prisma.Decimal (decimal.js) rounds half-up by default when rounding mode isn't explicitly passed,
  // but let's be explicit: 1 is ROUND_HALF_UP.
  const amount = new Prisma.Decimal(sessionsRemaining)
    .div(totalSessionsBilled)
    .times(payment.amount)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed(2);

  return { amount, sessionsRemaining, totalSessionsBilled };
}

export async function createPendingRefund(paymentId: string, reason: string) {
  const { amount, sessionsRemaining, totalSessionsBilled } = await calculateProration(
    paymentId,
    reason,
  );

  return prisma.refund.create({
    data: {
      paymentId,
      reason: reason as RefundReason,
      amount,
      sessionsRemaining,
      totalSessionsBilled,
      status: 'PENDING',
      approvedById: null,
      approvedAt: null,
    },
  });
}

export async function approveRefund(refundId: string, adminId: string) {
  const refund = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!refund) {
    throw new ApiError(404, 'Refund not found');
  }

  if (refund.status === 'APPROVED' || refund.status === 'REJECTED') {
    throw new ApiError(409, 'This refund has already been actioned');
  }

  if ((refund as any)._policyQualifies === false) {
    throw new ApiError(409, 'This case does not meet the refund policy conditions');
  }

  const { count } = await prisma.refund.updateMany({
    where: { id: refundId, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      approvedById: adminId,
      approvedAt: new Date(),
    },
  });
  if (count === 0) {
    throw new ApiError(409, 'This refund has already been actioned');
  }
  const updated = await prisma.refund.findUnique({ where: { id: refundId } });

  await recordAuditLog({
    actor: adminId,
    action: 'REFUND_APPROVED',
    target: refundId,
    timestamp: new Date(),
  });

  return updated!;
}

export async function rejectRefund(refundId: string, adminId: string, rejectionReason: string) {
  const refund = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!refund) {
    throw new ApiError(404, 'Refund not found');
  }

  if (refund.status === 'APPROVED' || refund.status === 'REJECTED') {
    throw new ApiError(409, 'This refund has already been actioned');
  }

  const { count } = await prisma.refund.updateMany({
    where: { id: refundId, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      rejectedById: adminId,
      rejectedAt: new Date(),
      rejectionReason,
    },
  });
  if (count === 0) {
    throw new ApiError(409, 'This refund has already been actioned');
  }
  const updated = await prisma.refund.findUnique({ where: { id: refundId } });

  await recordAuditLog({
    actor: adminId,
    action: 'REFUND_REJECTED',
    target: refundId,
    timestamp: new Date(),
  });

  return updated!;
}
