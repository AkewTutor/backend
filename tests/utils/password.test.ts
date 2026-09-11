/**
 * tests/utils/password.test.ts
 *
 * Journey step 1.7. Spec: `09-1-shared-config.md` §9.6.
 * NFRs: NFR-008.
 * OWASP: A02:2021 – Cryptographic Failures.
 *
 * Real `bcrypt` — nothing mocked. `.env.test` sets BCRYPT_SALT_ROUNDS=4
 * (cheap-but-real cost factor) so this suite stays fast without stubbing
 * the algorithm itself.
 */

import { describe, expect, it } from 'vitest';

import { comparePassword, hashPassword } from '../../src/utils/password.js';

describe('hashPassword / comparePassword', () => {
  it('hash then compare succeeds for the correct password', async () => {
    const hash = await hashPassword('mypassword123');

    await expect(comparePassword('mypassword123', hash)).resolves.toBe(true);
  });

  it('compare fails for the wrong password, without throwing', async () => {
    const hash = await hashPassword('mypassword123');

    await expect(comparePassword('wrongpassword', hash)).resolves.toBe(false);
  });

  it('hash is never plain text and is non-deterministic per call', async () => {
    const hash1 = await hashPassword('samepassword');
    const hash2 = await hashPassword('samepassword');

    expect(hash1).not.toBe(hash2);
    expect(hash1).not.toBe('samepassword');
    expect(hash2).not.toBe('samepassword');
  });

  it('uses a well-formed bcrypt hash, not a stub', async () => {
    const hash = await hashPassword('anotherpassword');

    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });
});
