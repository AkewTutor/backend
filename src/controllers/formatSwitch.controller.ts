import type { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import * as formatSwitchService from '../services/formatSwitch.service.js';
import { resolveCallerProfileId } from '../utils/profileIds.js';

export async function requestSwitch(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const callerId = await resolveCallerProfileId(user);
    const { studentId, toFormat } = req.body;

    const result = await formatSwitchService.requestSwitch(
      callerId,
      user.role,
      studentId,
      toFormat,
    );
    res.status(201).json({ statusCode: 201, success: true, message: 'Created', data: result });
  } catch (error) {
    next(error);
  }
}
