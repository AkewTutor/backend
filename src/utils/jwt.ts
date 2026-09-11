import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AccessTokenPayload {
  id: string;
  role: string;
}

/**
 * Signs an access token carrying only { id, role } — never password/passwordHash.
 * Algorithm is pinned to HS256; expiry comes from env.JWT_EXPIRES_IN.
 */
export const signAccessToken = (payload: AccessTokenPayload): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

/**
 * Verifies a token's signature, expiry, and algorithm (pinned to HS256 —
 * rejects "alg: none" and any other algorithm). Throws on any failure;
 * callers (e.g. authMiddleware) are responsible for catching.
 */
export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
};
