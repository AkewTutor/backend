// src/services/policy.service.ts
import type { PolicyType } from '@prisma/client';

import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const VALID_POLICY_TYPES: readonly PolicyType[] = ['PRIVACY', 'TERMS', 'SAFETY', 'REFUND', 'RULES'];

/**
 * Defensive type guard. The route layer validates `:type` against the
 * same enum via `getPolicySchema`/`publishPolicySchema`, but `getCurrentPolicy`
 * receives a raw path-param string at runtime, and the unit test tier calls
 * the service directly with `as any`-cast values — so the guard runs here
 * too, before any DB access, exactly as the "defensively rejected" test
 * requires.
 */
function assertValidPolicyType(type: string): asserts type is PolicyType {
  if (!VALID_POLICY_TYPES.includes(type as PolicyType)) {
    throw new ApiError(400, 'Invalid policy type');
  }
}

// ──────────────────────────────────────────────────────────────
// getCurrentPolicy
// ──────────────────────────────────────────────────────────────

/**
 * Return the highest `version` row for the given `type` (Doc 04 §4.2.9).
 * Public pages always read the latest published version.
 *
 * Throws ApiError(400, "Invalid policy type") on a type outside the
 * closed enum — before touching the DB — and ApiError(404, "Policy not
 * yet published") when no version exists yet for a valid type.
 */
export async function getCurrentPolicy(type: PolicyType): Promise<{
  id: string;
  type: PolicyType;
  content: string;
  version: number;
  publishedById: string;
  publishedAt: Date;
  createdAt: Date;
}> {
  assertValidPolicyType(type);

  const row = await prisma.policyDocument.findFirst({
    where: { type },
    orderBy: { version: 'desc' },
  });

  if (!row) {
    throw new ApiError(404, 'Policy not yet published');
  }

  return row;
}

// ──────────────────────────────────────────────────────────────
// publishNewVersion
// ──────────────────────────────────────────────────────────────

/**
 * Create a new versioned row for the given `type` — insert-only, never
 * updating or deleting a prior version (Doc 04 §4.2.9: "Like the
 * reference project's ScoreWeightConfig, pricing is versioned rather than
 * edited in place ... so every Payment/TutorEarning can be traced back to
 * the exact rate in force at the time").
 *
 * Version computation: `(current max version for type) + 1`, where a
 * missing prior row means version 1. Two concurrent publishes for the
 * same type could race to the same version number and one would fail on
 * the `@@unique([type, version])` constraint — acceptable for V1 (no
 * documented concurrent-publish surface); a serializable transaction
 * would be the fix if that changes.
 */
export async function publishNewVersion(
  type: PolicyType,
  content: string,
  createdById: string,
): Promise<{ type: PolicyType; version: number; publishedAt: Date }> {
  assertValidPolicyType(type);

  const latest = await prisma.policyDocument.findFirst({
    where: { type },
    orderBy: { version: 'desc' },
  });

  const nextVersion = (latest?.version ?? 0) + 1;

  const created = await prisma.policyDocument.create({
    data: {
      type,
      content,
      version: nextVersion,
      publishedById: createdById,
    },
  });

  return {
    type: created.type,
    version: created.version,
    publishedAt: created.publishedAt,
  };
}
