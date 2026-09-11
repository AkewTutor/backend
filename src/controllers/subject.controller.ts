// STUB: auto-generated placeholder to satisfy TypeScript module resolution.
// TODO: implement real logic.
import type { Request, Response, NextFunction } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';

export const listSubjects = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    throw new ApiError(501, 'listSubjects not implemented');
  },
);
