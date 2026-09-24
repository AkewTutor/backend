import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as recordingConsentService from '../services/recordingConsent.service.js';

export const getStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tutorId = req.query.tutorId as string;
    const studentId = req.query.studentId as string;
    const status = await recordingConsentService.getConsentStatus(tutorId, studentId);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', status));
  } catch (error) {
    next(error);
  }
};

export const acknowledge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, role } = (req as any).user;
    const { tutorId, studentId } = req.body;
    let result;
    if (role === 'TUTOR') {
      result = await recordingConsentService.acknowledgeAsTutor(id, tutorId, studentId);
    } else {
      result = await recordingConsentService.acknowledgeAsStudentOrParent(id, tutorId, studentId);
    }
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};
