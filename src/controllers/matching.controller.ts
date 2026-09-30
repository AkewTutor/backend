import type { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import * as matchingService from '../services/matching.service.js';
import { resolveCallerProfileId } from '../utils/profileIds.js';

export async function searchTutors(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const callerId = await resolveCallerProfileId(user);
    const result = await matchingService.searchOneToOneTutors(
      callerId,
      user.role,
      undefined,
      req.query,
    );
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
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
    const callerId = await resolveCallerProfileId(user);
    const result = await matchingService.recommendTutorsWithMatchPercent(
      callerId,
      user.role,
      undefined,
      req.query,
    );
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
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
    const callerId = await resolveCallerProfileId(user);
    const tutorId = req.params.tutorId as string;
    const result = await matchingService.getTutorDetail(tutorId, callerId, user.role);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
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
    const callerId = await resolveCallerProfileId(user);
    const { tutorId, studentId } = req.body;
    const result = await matchingService.selectTutor(
      callerId,
      user.role,
      studentId as string | undefined,
      tutorId as string,
    );
    res.status(201).json({ statusCode: 201, success: true, message: 'Created', data: result });
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
    const callerId = await resolveCallerProfileId(user);
    const { studentId, subjectId } = req.body ?? {};
    const result = await matchingService.triggerNoExactMatch(
      callerId,
      user.role,
      studentId as string | undefined,
      subjectId as string | undefined,
    );
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
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
    const callerId = await resolveCallerProfileId(user);
    const { studentId, subjectId } = req.body ?? {};
    const result = await matchingService.requestGroupFormat(
      callerId,
      user.role,
      studentId as string | undefined,
      subjectId as string,
    );
    res.status(201).json({ statusCode: 201, success: true, message: 'Created', data: result });
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
    const callerId = await resolveCallerProfileId(user);
    const studentId = req.query.studentId as string | undefined;
    const result = await matchingService.getMyRequestStatus(callerId, user.role, studentId);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}
