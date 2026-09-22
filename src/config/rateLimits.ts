// src/config/rateLimits.ts
/**
 * Named rate-limit threshold constants, consumed by
 * `rateLimiter.middleware.ts` call sites. Values match
 * `00-api-conventions.md` §0.8.
 */

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export const LOGIN_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  max: 5,
};

/**
 * Alias for `LOGIN_LIMIT`, matching the name the persistence suite reads
 * (`tests/integration/auth.service.persistence.test.ts` destructures
 * `LOGIN_RATE_LIMIT` to derive the failed-attempt threshold `N`). Kept as
 * a second binding rather than a rename so both the Doc 05a §0 name
 * (`LOGIN_LIMIT`, imported by `auth.routes.ts`) and the test-suite name
 * resolve to the same config object.
 */
export const LOGIN_RATE_LIMIT: RateLimitConfig = LOGIN_LIMIT;

export const RESEND_VERIFICATION_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60 * 1000,
  max: 3,
};

export const FORGOT_PASSWORD_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60 * 1000,
  max: 3,
};

export const PAYMENT_INITIATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60 * 1000,
  max: 10,
};

export const SEND_MESSAGE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  max: 30,
};
