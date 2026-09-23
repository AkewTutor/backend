import type { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import * as formatSwitchService from '../services/formatSwitch.service.js';

export async function requestSwitch(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { studentId, toFormat } = req.body;

    const result = await formatSwitchService.requestSwitch(user.id, user.role, studentId, toFormat);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
