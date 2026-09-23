import type { Request, Response, NextFunction } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import * as adminTutorVerificationService from '../services/adminTutorVerification.service.js';

export const listPending = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const result = await adminTutorVerificationService.listPendingTutors(page, limit);
    res.status(200).json(result);
  },
);

export const approve = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tutorId = req.params.tutorId as string;
    const adminId = (req as any).user.id;
    const result = await adminTutorVerificationService.approveTutor(tutorId, adminId);
    res.status(200).json(result);
  },
);

export const reject = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tutorId = req.params.tutorId as string;
    const adminId = (req as any).user.id;
    const { reason } = req.body;
    const result = await adminTutorVerificationService.rejectTutor(tutorId, adminId, reason);
    res.status(200).json(result);
  },
);
