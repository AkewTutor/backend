import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError.js';
import { ErrorResponse } from '../utils/ApiResponse.js'; // 🟢 Using the dedicated ErrorResponse variant
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

const errorMiddleware = (err: Error, req: Request, res: Response, next: NextFunction) => {
  // 1. Log the full Error Object (Pino captures the full stack trace cleanly)
  logger.error(err, `[${req.method}] ${req.path}`);

  // 2. Handle Known/Expected Operational Errors (ApiError)
  if (err instanceof ApiError) {
    return res
      .status(err.statusCode)
      .json(new ErrorResponse(err.statusCode, err.message, err.errors));
  }

  // 2b. Body-parser errors are not ApiErrors; map them to proper client errors
  // instead of letting them fall through to a misleading 500.
  const bodyErrType = (err as { type?: string }).type;
  if (bodyErrType === 'entity.too.large') {
    return res.status(413).json(new ErrorResponse(413, 'Request body too large', []));
  }
  if (bodyErrType === 'entity.parse.failed') {
    return res.status(400).json(new ErrorResponse(400, 'Malformed JSON body', []));
  }

  // 3. Handle Unknown/Unexpected System Crashes (e.g., Database connection drops, syntax bugs)
  // 🛡️ Critical Security Step: Hide native system crash details from clients in production
  const errorMessage = 'Internal server error';

  return res.status(500).json(new ErrorResponse(500, errorMessage, []));
};

export default errorMiddleware;
