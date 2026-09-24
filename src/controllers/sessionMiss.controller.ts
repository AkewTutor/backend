import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as sessionMissService from '../services/sessionMiss.service.js';

export const listMisses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, role } = (req as any).user;
    let tutorId = req.query.tutorId as string;

    if (role === 'TUTOR') {
      tutorId = id;
    }

    // Merge everything into one options object since the test expects 1 argument
    const result = await sessionMissService.listMisses({ ...req.query, tutorId });
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const reportMiss = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId, causedBy, missType } = req.body;
    let result;
    if (causedBy === 'TUTOR') {
      result = await sessionMissService.recordTutorCausedMiss(sessionId, missType);
    } else {
      result = await sessionMissService.recordStudentCausedMiss(sessionId, missType);
    }
    res
      .status(HTTP_STATUS.CREATED)
      .json(new SuccessResponse(HTTP_STATUS.CREATED, 'Created', result));
  } catch (error) {
    next(error);
  }
};
