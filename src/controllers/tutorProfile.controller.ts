import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import * as tutorProfileService from '../services/tutorProfile.service.js';

export async function getProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await tutorProfileService.getProfile(req.user!.id);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await tutorProfileService.updateProfile(req.user!.id, req.body);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}

export async function resubmitVerification(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await tutorProfileService.resubmitVerification(req.user!.id);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}

export async function rankSubjects(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await tutorProfileService.rankSubjects(req.user!.id, req.body.subjects);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}
