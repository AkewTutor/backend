import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as sessionMissService from '../services/sessionMiss.service.js';
import { resolveCallerProfileId } from '../utils/profileIds.js';

export const listMisses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    // Cohort.tutorId is the TutorProfile id, not the JWT user id.
    // A Tutor is always scoped to their own record (client tutorId ignored); Admin may filter.
    const tutorId: string | undefined =
      user.role === 'TUTOR'
        ? await resolveCallerProfileId(user)
        : (req.query.tutorId as string | undefined) || undefined;

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
