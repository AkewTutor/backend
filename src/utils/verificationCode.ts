import { createHash, randomInt } from 'crypto';

/** 6-digit numeric code, sent to the user over email/SMS. */
export function generateVerificationCode(): string {
  return String(randomInt(100_000, 999_999));
}

/**
 * One-way hash of a code for storage — mirrors hashRefreshToken in
 * refreshToken.ts. We never store the plaintext code, only this hash,
 * so a DB read alone can't be used to verify or reset an account.
 */
export function hashVerificationCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
