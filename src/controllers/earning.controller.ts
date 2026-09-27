import { Request, Response, NextFunction } from 'express';
import * as earningService from '../services/earning.service.js';
import ApiError from '../utils/ApiError.js';

export const getMyEarnings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tutorId = (req as any).user?.id;
    if (!tutorId) throw new ApiError(401, 'Unauthorized');

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await earningService.getEarningsForTutor(tutorId, page, limit);

    return res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
};
