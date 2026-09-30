import { Request, Response, NextFunction } from 'express';
import * as earningService from '../services/earning.service.js';
import ApiError from '../utils/ApiError.js';
import { resolveCallerProfileId } from '../utils/profileIds.js';

export const getMyEarnings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user?.id) throw new ApiError(401, 'Unauthorized');
    const tutorId = await resolveCallerProfileId(user);

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await earningService.getEarningsForTutor(tutorId, page, limit);

    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
};
