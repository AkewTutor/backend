import { Request, Response, NextFunction } from 'express';
import * as payoutService from '../services/payout.service.js';
import ApiError from '../utils/ApiError.js';

export const adminList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tutorId, status, page, limit } = req.query;

    const filters: any = {};
    if (tutorId) filters.tutorId = tutorId as string;
    if (status) filters.status = status as string;
    if (page) filters.page = parseInt(page as string);
    if (limit) filters.limit = parseInt(limit as string);

    const result = await payoutService.listPayouts(filters);
    return res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
};

export const adminMarkPaid = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).user?.id;
    if (!adminId) throw new ApiError(401, 'Unauthorized');

    const payoutId = req.params.payoutId as string;

    const result = await payoutService.markPaid(payoutId, adminId);
    return res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
};
