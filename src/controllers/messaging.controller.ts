import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as messagingService from '../services/messaging.service.js';
import { resolveCallerProfileId } from '../utils/profileIds.js';

export const getThread = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callerId = await resolveCallerProfileId((req as any).user);
    const cohortId = req.params.cohortId as string;
    const result = await messagingService.getThreadForCohort(callerId, cohortId);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const listMessages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callerId = await resolveCallerProfileId((req as any).user);
    const cohortId = req.params.cohortId as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await messagingService.listMessages(callerId, cohortId, page, limit);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const callerId = await resolveCallerProfileId(user);
    const cohortId = req.params.cohortId as string;
    const { body } = req.body;
    // callerId is the role PROFILE id (used for access checks); Message.senderId is a
    // User FK, so pass the user id separately whenever the two differ.
    const result =
      user.id === callerId
        ? await messagingService.sendMessage(callerId, cohortId, body)
        : await messagingService.sendMessage(callerId, cohortId, body, user.id);
    res
      .status(HTTP_STATUS.CREATED)
      .json(new SuccessResponse(HTTP_STATUS.CREATED, 'Created', result));
  } catch (error) {
    next(error);
  }
};
