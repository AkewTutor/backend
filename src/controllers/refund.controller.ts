import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import * as refundService from '../services/refund.service.js';
import ApiError from '../utils/ApiError.js';
import { RefundStatus } from '@prisma/client';

const PARTIES_INCLUDE = {
  payment: {
    include: {
      cohortMembership: {
        include: {
          student: { include: { user: true } },
          cohort: { include: { tutor: { include: { user: true } } } },
        },
      },
    },
  },
} as const;

function personName(
  user: { name?: string | null; email?: string | null } | null | undefined,
  fallback: string,
): string {
  return user?.name?.trim() || user?.email || fallback;
}

function toRefundWithParties(row: any) {
  const { payment, ...refund } = row;
  const membership = payment?.cohortMembership;
  const studentUser = membership?.student?.user;
  const tutorUser = membership?.cohort?.tutor?.user;
  return {
    ...refund,
    studentName: personName(studentUser, 'Student'),
    studentEmail: studentUser?.email ?? null,
    tutorName: personName(tutorUser, 'Tutor'),
    tutorEmail: tutorUser?.email ?? null,
  };
}

export const adminReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = (req.query.status as RefundStatus) || 'PENDING';
    const rows = await prisma.refund.findMany({
      include: PARTIES_INCLUDE,
      orderBy: { createdAt: 'desc' },
      where: { status },
    });
    const refunds = rows.map(toRefundWithParties);
    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: refunds });
  } catch (error) {
    next(error);
  }
};

export const adminApprove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).user?.id;
    if (!adminId) throw new ApiError(401, 'Unauthorized');

    const result = await refundService.approveRefund(req.params.refundId as string, adminId);
    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
};

export const adminReject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).user?.id;
    if (!adminId) throw new ApiError(401, 'Unauthorized');

    const result = await refundService.rejectRefund(
      req.params.refundId as string,
      adminId,
      req.body.rejectionReason,
    );
    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
};
