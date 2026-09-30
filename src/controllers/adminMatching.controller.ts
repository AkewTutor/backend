import type { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import ApiError from '../utils/ApiError.js';
import * as adminMatchingService from '../services/adminMatching.service.js';

export async function listQueue(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const overdueOnly = req.query.overdueOnly === 'true';
    const path = req.query.path as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await adminMatchingService.listPendingApprovals(overdueOnly, path, page, limit);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}

export async function approve(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user!.id;
    const cohortId = req.params.cohortId as string;

    const result = await adminMatchingService.approveBooking(cohortId, adminId);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}

export async function reject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user!.id;
    const cohortId = req.params.cohortId as string;
    const { internalReason } = req.body ?? {};

    const result = await adminMatchingService.rejectBooking(cohortId, adminId, internalReason);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}

export async function manualAssign(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const adminId = req.user!.id;
    const { matchRequestId, matchRequestIds: idsFromBody, tutorId } = req.body ?? {};
    // Accept either a single matchRequestId or a matchRequestIds array
    const matchRequestIds: string[] = idsFromBody ?? (matchRequestId ? [matchRequestId] : []);
    if (matchRequestIds.length === 0 || !tutorId) {
      throw new ApiError(400, 'matchRequestId(s) and tutorId are required');
    }

    if (matchRequestIds.length > 1) {
      const result = await adminMatchingService.manuallyAssembleGroup(
        matchRequestIds,
        tutorId,
        adminId,
      );
      res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
    } else {
      const result = await adminMatchingService.manuallyAssignTutor(
        matchRequestIds,
        tutorId,
        adminId,
      );
      res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
    }
  } catch (error) {
    next(error);
  }
}
