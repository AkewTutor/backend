/**
 * tests/factories/shared-config.factory.ts
 *
 * Owns: User, RefreshToken, Notification, PolicyDocument
 * Ref: 00-test-fixtures.md §2 "shared-config"
 *
 * Phase 0, step 0.3 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 */

import { addDays, freshId, now, withOverrides } from './_helpers.js';
import type { Notification, PolicyDocument, RefreshToken, User } from './types.js';

/**
 * `role` defaults `STUDENT`. `passwordHash` is a fixed bcrypt-*shaped* dummy
 * hash — never a real hash, per §2's shared-config table. `termsAcceptedAt`
 * defaults to now.
 */
export function buildUser(overrides?: Partial<User>): User {
  const createdAt = now();
  const base: User = {
    id: freshId(),
    role: 'STUDENT',
    email: `user-${freshId()}@example.test`,
    phone: null,
    // Fixed bcrypt-shaped dummy hash ($2b$10$ + 53 chars) — never a real hash.
    passwordHash: '$2b$10$abcdefghijklmnopqrstuuvwxyzABCDEFGHIJKLMNOPQRSTUVWX',
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    preferredNotificationChannel: null,
    termsAcceptedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  };
  return withOverrides(base, overrides);
}

/**
 * Required override: `userId`. `familyId` defaults to a fresh UUID (new
 * rotation chain). `revokedAt`/`replacedByTokenId` default `null` (active
 * token). `expiresAt` defaults `createdAt` + 30 days (NFR-014).
 */
export function buildRefreshToken(
  overrides: Partial<RefreshToken> & { userId: string },
): RefreshToken {
  const createdAt = now();
  const base: RefreshToken = {
    id: freshId(),
    userId: overrides.userId,
    tokenHash: freshId(),
    familyId: freshId(),
    expiresAt: addDays(createdAt, 30),
    revokedAt: null,
    replacedByTokenId: null,
    createdByIp: '127.0.0.1',
    userAgent: 'vitest-fixture',
    createdAt,
  };
  return withOverrides(base, overrides);
}

/**
 * Required overrides: `userId`, `type` (no sensible cross-cutting default
 * given the L2 canonical-type table in Doc 04 §4.2.10). `status` defaults
 * `QUEUED`, `channel` defaults `PUSH`.
 */
export function buildNotification(
  overrides: Partial<Notification> & { userId: string; type: Notification['type'] },
): Notification {
  const base: Notification = {
    id: freshId(),
    userId: overrides.userId,
    type: overrides.type,
    payload: {},
    channel: 'PUSH',
    status: 'QUEUED',
    sentAt: null,
    readAt: null,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/**
 * Required overrides: `type`, `publishedById`. `version` defaults `1`,
 * `content` a short placeholder Markdown string.
 */
export function buildPolicyDocument(
  overrides: Partial<PolicyDocument> & { type: PolicyDocument['type']; publishedById: string },
): PolicyDocument {
  const publishedAt = now();
  const base: PolicyDocument = {
    id: freshId(),
    type: overrides.type,
    content: '# Placeholder Policy\n\nFixture content for tests only.',
    version: 1,
    publishedById: overrides.publishedById,
    publishedAt,
    createdAt: publishedAt,
  };
  return withOverrides(base, overrides);
}
