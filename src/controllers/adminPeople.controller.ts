import type { Request, Response, NextFunction } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import * as adminPeopleService from '../services/adminPeople.service.js';

export const listUsers = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const role = req.query.role as string | undefined;
    const search = req.query.search as string | undefined;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;

    const result = await adminPeopleService.listUsers(role, search, page, limit);
    res.status(200).json(result);
  },
);

export const manageRelationshipRecords = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const relationshipId = req.params.relationshipId as string;
    const adminId = (req as any).user.id;
    const updates = req.body;

    const result = await adminPeopleService.manageRelationshipRecords(
      relationshipId,
      adminId,
      updates,
    );
    res.status(200).json(result);
  },
);

export const suspendAccount = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.params.userId as string;
    const adminId = (req as any).user.id;
    const { reason, restrictionType } = req.body;

    const result = await adminPeopleService.suspendAccount(
      userId,
      adminId,
      reason,
      restrictionType,
    );
    res.status(200).json(result);
  },
);
