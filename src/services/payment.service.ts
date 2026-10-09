import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { initiateCheckout, verifyWebhookSignature } from '../utils/providers/chapa.client.js';
import { applyToPayment } from './promotion.service.js';
import { generateSessionsForCohort } from './session.service.js';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';
import { Prisma } from '@prisma/client';

export async function initiatePayment(
  callerId: string,
  callerRole: string,
  cohortMembershipId: string,
  promotionCode?: string,
) {
  const membership = await prisma.cohortMembership.findUnique({
    where: { id: cohortMembershipId },
    include: { cohort: true, student: true },
  });

  if (!membership) throw new ApiError(404, 'CohortMembership not found');
  if (membership.status !== 'PENDING_PAYMENT') {
    throw new ApiError(409, 'This membership is not awaiting payment');
  }

  if (callerRole === 'PARENT') {
    const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: callerId } });
    if (!parentProfile) throw new ApiError(403, 'Insufficient permissions to pay for this student');
    const rel = await prisma.parentStudentRelationship.findFirst({
      where: { parentId: parentProfile.id, studentId: membership.studentId, status: 'ACTIVE' },
    });
    if (!rel) throw new ApiError(403, 'Insufficient permissions to pay for this student');
  } else if (callerRole === 'STUDENT' && callerId !== membership.student.userId) {
    throw new ApiError(403, 'Insufficient permissions to pay for this student');
  }

  const pricing = await prisma.pricingConfig.findFirst({
    where: { format: membership.cohort.format, isActive: true },
  });

  if (!pricing) throw new ApiError(500, 'Pricing configuration missing');

  let amount = pricing.pricePerStudentPerHour.toString();

  if (promotionCode) {
    const discounted = await applyToPayment(promotionCode, amount);
    amount = discounted.discountedAmount;
  }

  const payment = await prisma.payment.create({
    data: {
      cohortMembershipId,
      amount: new Prisma.Decimal(amount),
      status: 'PENDING',
      billingPeriodStart: new Date(),
      billingPeriodEnd: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000), // 28 days
    },
  });

  const { checkoutUrl } = await initiateCheckout(
    amount,
    payment.id,
    `${env.PUBLIC_API_URL}/payments/webhook/chapa`,
  );

  return {
    paymentId: payment.id,
    chapaCheckoutUrl: checkoutUrl,
    amount,
    status: 'PENDING',
  };
}

export async function handleChapaWebhook(rawBody: Buffer, signatureHeader: string) {
  const isValid = await verifyWebhookSignature(rawBody, signatureHeader);
  if (!isValid) {
    throw new ApiError(400, 'Invalid webhook signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf-8'));
  } catch (err) {
    throw new ApiError(400, 'Invalid JSON body');
  }

  const { event, tx_ref } = payload;
  const payment = await prisma.payment.findUnique({
    where: { id: tx_ref },
    include: { cohortMembership: true },
  });

  if (!payment) return { received: true }; // Ignore unknown

  if (payment.status === 'SUCCESS' || payment.status === 'FAILED') {
    return { received: true };
  }

  if (event === 'SUCCESS' || event === 'charge.success') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'SUCCESS' },
    });

    if (!payment.cohortMembership.billingCycleAnchorDate) {
      await prisma.cohortMembership.update({
        where: { id: payment.cohortMembership.id },
        data: { billingCycleAnchorDate: new Date() },
      });
      await generateSessionsForCohort(payment.cohortMembership.cohortId);
    }
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    });
  }

  return { received: true };
}

export async function getPaymentHistory(
  callerId: string,
  callerRole: string,
  studentId?: string,
  page = 1,
  limit = 20,
) {
  let targetStudentProfileId = studentId;
  if (callerRole === 'STUDENT') {
    const studentProfile = await prisma.studentProfile.findUnique({ where: { userId: callerId } });
    if (!studentProfile) throw new ApiError(403, 'Student profile not found');
    targetStudentProfileId = studentProfile.id;
  }

  if (!targetStudentProfileId) throw new ApiError(400, 'studentId is required for parents');

  if (callerRole === 'PARENT') {
    const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: callerId } });
    if (!parentProfile) throw new ApiError(403, 'Parent profile not found');
    const rel = await prisma.parentStudentRelationship.findFirst({
      where: { parentId: parentProfile.id, studentId: targetStudentProfileId, status: 'ACTIVE' },
    });
    if (!rel) throw new ApiError(403, 'Insufficient permissions');
  }

  const skip = (page - 1) * limit;
  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where: { cohortMembership: { studentId: targetStudentProfileId } },
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payment.count({
      where: { cohortMembership: { studentId: targetStudentProfileId } },
    }),
  ]);

  return {
    payments,
    page: Number(page),
    limit: Number(limit),
    total,
  };
}
