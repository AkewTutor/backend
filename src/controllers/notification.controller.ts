// STUB: auto-generated placeholder to satisfy TypeScript module resolution.
// TODO: implement real logic.
import type { Request, Response, NextFunction } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';

export const listMyNotifications = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    throw new ApiError(501, 'listMyNotifications not implemented');
  },
);

export const markAsRead = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    throw new ApiError(501, 'markAsRead not implemented');
  },
);
