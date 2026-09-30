import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import * as refundService from '../services/refund.service.js';
import ApiError from '../utils/ApiError.js';
import { RefundStatus } from '@prisma/client';

export const adminReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = (req.query.status as RefundStatus) || 'PENDING';
    const refunds = await prisma.refund.findMany({
      where: { status },
    });
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
