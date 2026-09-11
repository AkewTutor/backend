/**
 * tests/utils/refreshToken.test.ts
 *
 * Journey step 1.6. Spec: `09-1-shared-config.md` §9.8 ("refreshToken.ts"
 * subsection), `8-1-shared-config.md` (`generateRefreshToken`, `hashRefreshToken`).
 * FRs: FR-SP-003. NFRs: NFR-014, NFR-015.
 *
 * Real `crypto` — nothing mocked.
 */

import { describe, expect, it } from 'vitest';

import { generateRefreshToken, hashRefreshToken } from '../../src/utils/refreshToken.js';

describe('generateRefreshToken', () => {
  it('produces distinct values across repeated calls', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();

    expect(a).not.toBe(b);
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
  });
});

describe('hashRefreshToken', () => {
  it('is deterministic — hashing the same raw string twice yields identical hashes', () => {
    const raw = generateRefreshToken();

    const hash1 = hashRefreshToken(raw);
    const hash2 = hashRefreshToken(raw);

    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', () => {
    const rawA = generateRefreshToken();
    const rawB = generateRefreshToken();

    expect(hashRefreshToken(rawA)).not.toBe(hashRefreshToken(rawB));
  });
});
