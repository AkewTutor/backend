import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as badgeService from '../services/badge.service.js';

export const listMyBadges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: callerId, role: callerRole } = (req as any).user;
    const studentId = req.query.studentId as string | undefined;

    const result = await badgeService.listMyBadges(callerId, callerRole, studentId);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const adminListAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const category = req.query.category as 'STUDENT' | 'TUTOR' | undefined;

    const result = await badgeService.adminManageBadges(page, limit, category as any);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const adminCreate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await badgeService.createBadge(req.body);
    res
      .status(HTTP_STATUS.CREATED)
      .json(new SuccessResponse(HTTP_STATUS.CREATED, 'Created', result));
  } catch (error) {
    next(error);
  }
};

export const adminAdjust = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { badgeId } = req.params;
    // Explicitly destructure to ensure no other fields (like rating) are forwarded
    const { isActive, criteriaDescription } = req.body;

    const payload: { isActive?: boolean; criteriaDescription?: string } = {};
    if (isActive !== undefined) payload.isActive = isActive;
    if (criteriaDescription !== undefined) payload.criteriaDescription = criteriaDescription;

    const result = await badgeService.adminManageBadges(badgeId as string, payload);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};
