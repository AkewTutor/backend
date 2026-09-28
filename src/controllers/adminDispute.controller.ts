import { Request, Response, NextFunction } from 'express';
import * as adminDisputeService from '../services/adminDispute.service.js';
import ApiError from '../utils/ApiError.js';

export const listQueue = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, category, page, limit } = req.query;

    const parsedPage = page ? parseInt(page as string) : 1;
    const parsedLimit = limit ? parseInt(limit as string) : 20;

    const result = await adminDisputeService.listDisputeQueue(
      status as string,
      category as string,
      parsedPage,
      parsedLimit,
    );
    return res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
};

export const getDisputeDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaintId = String(req.params.complaintId);

    const result = await adminDisputeService.getDisputeForReview(complaintId);
    return res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
};

export const resolveDispute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new ApiError(401, 'Unauthorized');

    const complaintId = String(req.params.complaintId);

    const result = await adminDisputeService.resolveDispute(complaintId, user.id, req.body);
    return res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
};
