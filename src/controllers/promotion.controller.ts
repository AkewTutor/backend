// STUB: auto-generated placeholder to satisfy TypeScript module resolution.
// TODO: implement real logic.
import type { Request, Response, NextFunction } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';

export const adminCreate = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    throw new ApiError(501, 'adminCreate not implemented');
  },
);

export const adminEdit = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    throw new ApiError(501, 'adminEdit not implemented');
  },
);

export const listActive = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    throw new ApiError(501, 'listActive not implemented');
  },
);
