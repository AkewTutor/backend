import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as quizService from '../services/assessmentQuiz.service.js';
import { resolveCallerProfileId, resolveGamificationCallerId } from '../utils/profileIds.js';

export const createQuiz = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callerId = await resolveCallerProfileId((req as any).user);
    const result = await quizService.createQuiz(callerId, req.body);
    res
      .status(HTTP_STATUS.CREATED)
      .json(new SuccessResponse(HTTP_STATUS.CREATED, 'Created', result));
  } catch (error) {
    next(error);
  }
};

export const updateQuiz = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callerId = await resolveCallerProfileId((req as any).user);
    const result = await quizService.updateQuiz(callerId, req.params.quizId as string, req.body);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const deleteQuiz = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callerId = await resolveCallerProfileId((req as any).user);
    const result = await quizService.deleteQuiz(callerId, req.params.quizId as string);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const resetAttempt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callerId = await resolveCallerProfileId((req as any).user);
    const result = await quizService.resetAttempt(callerId, req.params.attemptId as string);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const listForCohort = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const callerId = await resolveCallerProfileId(user);
    const quizzes = await quizService.getQuizzesForCohort(
      callerId,
      user.role,
      req.params.cohortId as string,
    );
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', { quizzes }));
  } catch (error) {
    next(error);
  }
};

export const submitAttempt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callerId = await resolveCallerProfileId((req as any).user);
    const result = await quizService.submitAttempt(
      callerId,
      req.params.quizId as string,
      req.body.answers,
    );
    res
      .status(HTTP_STATUS.CREATED)
      .json(new SuccessResponse(HTTP_STATUS.CREATED, 'Created', result));
  } catch (error) {
    next(error);
  }
};

export const getHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const callerId = await resolveGamificationCallerId(user);
    const query = req.query as { q?: string; studentId?: string };
    const history = await quizService.getAssessmentHistory(callerId, user.role, {
      q: query.q || undefined,
      studentId: query.studentId || undefined,
    });
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', { history }));
  } catch (error) {
    next(error);
  }
};
