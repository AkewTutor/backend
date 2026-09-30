import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as assessmentService from '../services/weeklyAssessment.service.js';
import { resolveCallerProfileId } from '../utils/profileIds.js';

export const submit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callerId = await resolveCallerProfileId((req as any).user);
    const result = await assessmentService.submitAssessment(callerId, req.body);
    res
      .status(HTTP_STATUS.CREATED)
      .json(new SuccessResponse(HTTP_STATUS.CREATED, 'Created', result));
  } catch (error) {
    next(error);
  }
};

export const listForMembership = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callerId = await resolveCallerProfileId((req as any).user);
    const membershipId = req.params.id as string;
    const result = await assessmentService.getAssessmentsForStudent(callerId, membershipId);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};
