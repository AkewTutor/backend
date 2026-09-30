import type { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import * as cohortService from '../services/cohort.service.js';
import { resolveCallerProfileId } from '../utils/profileIds.js';

export async function getMyCohort(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const callerId = await resolveCallerProfileId(user);
    const studentId = req.query.studentId as string | undefined;
    const result = await cohortService.getMyCohort(callerId, user.role, { studentId });
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
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
    const callerId = await resolveCallerProfileId(user);
    const cohortId = req.params.cohortId as string;
    const result = await cohortService.getCohortMembers(cohortId, callerId, user.role);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}
