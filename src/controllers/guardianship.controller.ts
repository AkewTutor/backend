import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import * as guardianshipService from '../services/guardianship.service.js';

export async function addStudentAndInvite(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { grade, inviteContact } = req.body;
    const result = await guardianshipService.addStudentAndInvite(
      req.user!.id,
      grade,
      inviteContact,
    );
    res.status(201).json({ statusCode: 201, success: true, message: 'Created', data: result });
  } catch (error) {
    next(error);
  }
}

export async function inviteOptionalGuardian(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { inviteContact } = req.body;
    const result = await guardianshipService.inviteOptionalGuardian(req.user!.id, inviteContact); // Assuming caller is student
    res.status(201).json({ statusCode: 201, success: true, message: 'Created', data: result });
  } catch (error) {
    next(error);
  }
}

export async function revokeRelationship(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await guardianshipService.revokeOrModifyRelationship(
      req.user!.id,
      req.user!.role,
      id as string,
      req.body,
    );
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}

export async function resendInvite(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await guardianshipService.resendOrRegenerateInvite(req.user!.id, id as string);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}

export async function activateInvite(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const result = await guardianshipService.activateInvite(token as string, password);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}
