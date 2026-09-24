import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as challengeService from '../services/challenge.service.js';

export const listActive = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await challengeService.listActiveChallenges();
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const getMyProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: callerId, role: callerRole } = (req as any).user;
    const studentId = req.query.studentId as string | undefined;

    const result = await challengeService.getMyProgress(callerId, callerRole, studentId);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const adminCreate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: adminId } = (req as any).user;
    const result = await challengeService.createChallenge(req.body, adminId);
    res
      .status(HTTP_STATUS.CREATED)
      .json(new SuccessResponse(HTTP_STATUS.CREATED, 'Created', result));
  } catch (error) {
    next(error);
  }
};
