import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import * as studentProfileService from '../services/studentProfile.service.js';

export async function getMyProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const studentId = req.query.studentId as string | undefined;
    const profile = await studentProfileService.getProfile(
      req.user!.id,
      req.user!.role as 'STUDENT' | 'PARENT',
      studentId,
    );

    res.status(200).json({
      statusCode: 200,
      success: true,
      message: 'OK',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateBasicProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { studentId, ...input } = req.body;
    const profile = await studentProfileService.updateBasicProfile(
      req.user!.id,
      req.user!.role as 'STUDENT' | 'PARENT',
      studentId,
      input,
    );

    res.status(200).json({
      statusCode: 200,
      success: true,
      message: 'OK',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAcademicProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { studentId, ...input } = req.body;
    const targetStudentId = studentId || (req.query.studentId as string | undefined);

    const profile = await studentProfileService.updateAcademicProfile(
      req.user!.id,
      req.user!.role as 'STUDENT' | 'PARENT',
      targetStudentId,
      input,
    );

    res.status(200).json({
      statusCode: 200,
      success: true,
      message: 'OK',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
}
