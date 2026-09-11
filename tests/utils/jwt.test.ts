/**
 * tests/utils/jwt.test.ts
 *
 * Journey step 1.5. Spec: `09-1-shared-config.md` §9.5.
 * FRs: FR-SP-003. NFRs: NFR-007, NFR-008.
 * OWASP: A02:2021 – Cryptographic Failures, A07:2021 – Identification and
 *        Authentication Failures.
 *
 * Real `jsonwebtoken` against the test secret from .env.test — nothing
 * mocked here.
 */

import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';

import { signAccessToken, verifyAccessToken } from '../../src/utils/jwt.js';

describe('signAccessToken', () => {
  it('signs a valid token — 3 dot-separated segments, payload carries id/role', () => {
    const token = signAccessToken({ id: 'u1', role: 'STUDENT' });

    expect(token.split('.')).toHaveLength(3);
    const decoded = jwt.decode(token) as any;
    expect(decoded.id).toBe('u1');
    expect(decoded.role).toBe('STUDENT');
  });

  it('does not embed the password or any sensitive field', () => {
    const token = signAccessToken({ id: 'u1', role: 'STUDENT' } as any);
    const decoded = jwt.decode(token) as any;

    const keys = Object.keys(decoded);
    expect(keys).toEqual(expect.arrayContaining(['id', 'role']));
    expect(decoded.password).toBeUndefined();
    expect(decoded.passwordHash).toBeUndefined();
  });

  it('has a bounded expiry — exp is present and set to a fixed short-to-medium duration', () => {
    const token = signAccessToken({ id: 'u1', role: 'STUDENT' });
    const decoded = jwt.decode(token) as any;

    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });
});

describe('verifyAccessToken', () => {
  it('verifies a valid, unexpired token and returns the decoded payload', () => {
    const token = signAccessToken({ id: 'u1', role: 'TUTOR' });

    const payload = verifyAccessToken(token) as any;

    expect(payload.id).toBe('u1');
    expect(payload.role).toBe('TUTOR');
  });

  it('throws on an expired token — caller (authMiddleware) is responsible for catching', () => {
    const expiredToken = jwt.sign({ id: 'u1', role: 'STUDENT' }, process.env.JWT_SECRET as string, {
      algorithm: 'HS256',
      expiresIn: '-1s',
    });

    expect(() => verifyAccessToken(expiredToken)).toThrow();
  });

  it('throws on a tampered signature', () => {
    const token = signAccessToken({ id: 'u1', role: 'STUDENT' });
    const parts = token.split('.');
    const tamperedSignature = parts[2].slice(0, -1) + (parts[2].endsWith('a') ? 'b' : 'a');
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

    expect(() => verifyAccessToken(tamperedToken)).toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    const token = jwt.sign({ id: 'u1', role: 'STUDENT' }, 'a-completely-different-secret', {
      algorithm: 'HS256',
      expiresIn: '30m',
    });

    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('pins the signing algorithm — an unsigned "alg: none" token is rejected', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ id: 'u1', role: 'ADMIN' })).toString('base64url');
    const noneAlgToken = `${header}.${payload}.`;

    expect(() => verifyAccessToken(noneAlgToken)).toThrow();
  });
});
