import type { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import * as matchingService from '../services/matching.service.js';

export async function searchTutors(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const result = await matchingService.searchOneToOneTutors(
      user.id,
      user.role,
      undefined,
      req.query,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getRecommendations(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const result = await matchingService.recommendTutorsWithMatchPercent(
      user.id,
      user.role,
      undefined,
      req.query,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getTutorDetail(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const tutorId = req.params.tutorId as string;
    const result = await matchingService.getTutorDetail(tutorId, user.id, user.role);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function selectTutor(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { tutorId, studentId } = req.body;
    const result = await matchingService.selectTutor(
      user.id,
      user.role,
      studentId as string | undefined,
      tutorId as string,
    );
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function noExactMatch(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const studentId = req.body || {};
    const result = await matchingService.triggerNoExactMatch(
      user.id,
      user.role,
      studentId as string | undefined,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function requestGroupFormat(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { studentId, subjectId } = req.body;
    const result = await matchingService.requestGroupFormat(
      user.id,
      user.role,
      studentId as string | undefined,
      subjectId as string,
    );
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getMyRequestStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const studentId = req.query.studentId as string | undefined;
    const result = await matchingService.getMyRequestStatus(user.id, user.role, studentId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
