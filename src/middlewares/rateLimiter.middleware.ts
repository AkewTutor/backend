import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { ErrorResponse } from '../utils/ApiResponse.js'; // 🟢 Consolidated API layout
import { HTTP_STATUS } from '../constants/index.js';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
}

/**
 * Ad-hoc rate limiter factory (distinct from the two pre-configured
 * limiters below) — lets a caller build a one-off limiter with its own
 * window/ceiling/key, e.g. for a single sensitive route.
 */
export function rateLimiter(config: RateLimitConfig) {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: config.keyGenerator
      ? (req: Request, _res: Response) => config.keyGenerator!(req)
      : undefined,
    handler: (req: Request, res: Response, _next: NextFunction) => {
      return res
        .status(HTTP_STATUS.TOO_MANY_REQUESTS)
        .json(
          new ErrorResponse(
            HTTP_STATUS.TOO_MANY_REQUESTS,
            'Too many requests, please try again later',
            [],
          ),
        );
    },
  });
}

export const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  // 🟢 Intercept the limitation event and route it through your design system
  handler: (req, res) => {
    return res
      .status(HTTP_STATUS.TOO_MANY_REQUESTS)
      .json(
        new ErrorResponse(
          HTTP_STATUS.TOO_MANY_REQUESTS,
          'Too many requests, please try again later.',
          [],
        ),
      );
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Stricter ceiling for sensitive authentication hooks
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res
      .status(HTTP_STATUS.TOO_MANY_REQUESTS)
      .json(
        new ErrorResponse(
          HTTP_STATUS.TOO_MANY_REQUESTS,
          'Too many login attempts, please try again later.',
          [],
        ),
      );
  },
});
