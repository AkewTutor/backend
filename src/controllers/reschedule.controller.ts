import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as rescheduleService from '../services/reschedule.service.js';

export const requestReschedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: callerId } = (req as any).user;
    const { sessionId, requestedNewStart } = req.body;
    const result = await rescheduleService.requestReschedule(
      callerId,
      sessionId,
      new Date(requestedNewStart),
    );
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};
