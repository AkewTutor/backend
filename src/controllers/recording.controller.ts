import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as recordingService from '../services/recording.service.js';
import ApiError from '../utils/ApiError.js';
import { resolveCallerProfileId } from '../utils/profileIds.js';

export const upload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tutorId = await resolveCallerProfileId((req as any).user);
    const { sessionId } = req.body;
    const file = req.file;
    if (!file) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'File is required');
    }

    const result = await recordingService.uploadRecording(tutorId, sessionId, file.buffer);
    res
      .status(HTTP_STATUS.CREATED)
      .json(new SuccessResponse(HTTP_STATUS.CREATED, 'Created', result));
  } catch (error) {
    next(error);
  }
};

export const getMyRecordings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = await resolveCallerProfileId((req as any).user);
    const result = await recordingService.getMyRecordings(id, req.query);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const getSignedUrl = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = await resolveCallerProfileId((req as any).user);
    const recordingId = req.params.recordingId as string;
    const result = await recordingService.getSignedUrl(id, recordingId);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const keepPermanently = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = await resolveCallerProfileId((req as any).user);
    const recordingId = req.params.recordingId as string;
    const result = await recordingService.keepPermanently(id, recordingId);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};
