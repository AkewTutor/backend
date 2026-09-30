import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as xpService from '../services/xp.service.js';
import ApiError from '../utils/ApiError.js';
import { resolveGamificationCallerId } from '../utils/profileIds.js';

export const getMyProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callerRole = (req as any).user.role;
    const callerId = await resolveGamificationCallerId((req as any).user);
    const studentId = req.query.studentId as string | undefined;

    if (callerRole === 'PARENT' && !studentId) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'studentId is required for parents');
    }

    const result = await xpService.getMyProgress(callerId, callerRole, studentId);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const getLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callerRole = (req as any).user.role;
    const callerId = await resolveGamificationCallerId((req as any).user);
    const studentId = req.query.studentId as string | undefined;
    const period = req.query.period as 'WEEKLY' | 'MONTHLY' | undefined;

    if (!period) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'period is required');
    }

    const result = await xpService.getLeaderboard(callerId, callerRole, studentId, period);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const adminAdjust = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: adminId } = (req as any).user;
    const { studentId } = req.params;
    const { amount, note } = req.body;

    const result = await xpService.adminAdjustXP(studentId as string, adminId, amount, note);
    res
      .status(HTTP_STATUS.CREATED)
      .json(new SuccessResponse(HTTP_STATUS.CREATED, 'Created', result));
  } catch (error) {
    next(error);
  }
};
