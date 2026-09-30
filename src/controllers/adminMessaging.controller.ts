import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as adminMessagingService from '../services/adminMessaging.service.js';

export const viewThread = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const threadId = String(req.params.threadId);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await adminMessagingService.viewThreadForDispute(threadId, page, limit);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const closeThread = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: adminId } = (req as any).user;
    const threadId = String(req.params.threadId);
    const { reason } = req.body ?? {};
    const result = await adminMessagingService.closeThread(threadId, adminId, reason);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};
