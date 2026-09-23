import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import * as subjectService from '../services/subject.service.js';

export async function listSubjects(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const result = await subjectService.listSubjects(includeInactive);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}

export async function createSubject(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { name } = req.body;
    const result = await subjectService.createSubject(name);
    res.status(201).json({ statusCode: 201, success: true, message: 'Created', data: result });
  } catch (error) {
    next(error);
  }
}

export async function deactivateSubject(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const result = await subjectService.deactivateSubject(id as string, isActive);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}
