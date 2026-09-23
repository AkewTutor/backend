import type { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import * as cohortService from '../services/cohort.service.js';

export async function getMyCohort(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const studentId = req.query.studentId as string | undefined;
    const result = await cohortService.getMyCohort(user.id, user.role, { studentId });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getCohortMembers(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const cohortId = req.params.cohortId as string;
    const result = await cohortService.getCohortMembers(cohortId, user.id, user.role);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
