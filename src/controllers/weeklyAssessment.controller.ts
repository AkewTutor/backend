// STUB: auto-generated placeholder to satisfy TypeScript module resolution.
// TODO: implement real logic.
import type { Request, Response, NextFunction } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';

export const listForMembership = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    throw new ApiError(501, 'listForMembership not implemented');
  },
);

export const submit = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    throw new ApiError(501, 'submit not implemented');
  },
);
