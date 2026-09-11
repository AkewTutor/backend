// STUB: auto-generated placeholder to satisfy TypeScript module resolution.
// TODO: implement real logic.
import type { Request, Response, NextFunction } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';

export const adminList = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    throw new ApiError(501, 'adminList not implemented');
  },
);

export const adminMarkPaid = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    throw new ApiError(501, 'adminMarkPaid not implemented');
  },
);
