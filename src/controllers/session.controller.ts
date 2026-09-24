import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as sessionService from '../services/session.service.js';

export const listMySessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, role } = (req as any).user;
    const result = await sessionService.listMySessions(id, role, req.query);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const getSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, role } = (req as any).user;
    const session = await sessionService.getSession(id, role, req.params.sessionId as string);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', session));
  } catch (error) {
    next(error);
  }
};

export const provideLink = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = (req as any).user;
    const { sessionId } = req.params;
    const { jitsiLinkUrl } = req.body;
    const result = await sessionService.provideJitsiLink(id, sessionId as string, jitsiLinkUrl);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const completeSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = (req as any).user;
    const { sessionId } = req.params;
    const result = await sessionService.markCompleted(id, sessionId as string);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};
