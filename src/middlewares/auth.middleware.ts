import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import { verifyAccessToken } from '../utils/jwt.js';
import ApiError from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/index.js';

/**
 * Verifies the Bearer token and attaches { id, role } to req.user, taken
 * solely from the token payload (no User row re-fetch). Any failure —
 * missing header, malformed header, expired/tampered/wrong-secret/
 * alg-confused token — surfaces as the identical ApiError(401) so callers
 * can't distinguish *why* auth failed.
 */
const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Missing, invalid, or expired token'));
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token) as { id: string; role: string };
    req.user = payload;
    next();
  } catch {
    next(new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Missing, invalid, or expired token'));
  }
};

/**
 * Role-based access guard. Must run after authMiddleware. If req.user is
 * missing (authMiddleware never ran), fails gracefully with an ApiError
 * rather than throwing a TypeError.
 */
export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new ApiError(HTTP_STATUS.FORBIDDEN, 'Insufficient permissions'));
      return;
    }

    next();
  };
};

export default authMiddleware;
