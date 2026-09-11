/**
 * tests/factories/matching-cohorts.factory.ts
 *
 * Owns: MatchRequest, TutorExclusion, Cohort, CohortMembership, FormatSwitchRequest
 * Ref: 00-test-fixtures.md §2 "matching-cohorts"
 *
 * Phase 0, step 0.5 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 */

import { freshId, now, withOverrides } from './_helpers.js';
import type {
  Cohort,
  CohortMembership,
  FormatSwitchRequest,
  MatchRequest,
  TutorExclusion,
} from './types.js';

/**
 * Required overrides: `studentId`, `subjectId`. `format` defaults
 * `ONE_TO_ONE`; `path` defaults `PATH_A`; `status` defaults `SEARCHING`.
 */
export function buildMatchRequest(
  overrides: Partial<MatchRequest> & { studentId: string; subjectId: string },
): MatchRequest {
  const createdAt = now();
  const base: MatchRequest = {
    id: freshId(),
    studentId: overrides.studentId,
    subjectId: overrides.subjectId,
    format: 'ONE_TO_ONE',
    path: 'PATH_A',
    status: 'SEARCHING',
    zeroMatchSince: null,
    resultingCohortId: null,
    createdAt,
    updatedAt: createdAt,
  };
  return withOverrides(base, overrides);
}

/** Required overrides: `studentId`, `tutorId`. `reason` defaults `ADMIN_REJECTED`. */
export function buildTutorExclusion(
  overrides: Partial<TutorExclusion> & { studentId: string; tutorId: string },
): TutorExclusion {
  const base: TutorExclusion = {
    id: freshId(),
    studentId: overrides.studentId,
    tutorId: overrides.tutorId,
    reason: 'ADMIN_REJECTED',
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/**
 * Required overrides: `tutorId`, `subjectId`. `format` defaults `ONE_TO_ONE`;
 * `status` defaults `PENDING_ADMIN_APPROVAL` (the 1-to-1 default per
 * schema) — pass `format: 'ONE_TO_THREE'` / `'ONE_TO_FIVE'` and
 * `status: 'FORMING'` explicitly for the group path, since the schema's
 * default is format-conditional and the factory cannot infer intent
 * silently.
 */
export function buildCohort(
  overrides: Partial<Cohort> & { tutorId: string; subjectId: string },
): Cohort {
  const createdAt = now();
  const base: Cohort = {
    id: freshId(),
    tutorId: overrides.tutorId,
    subjectId: overrides.subjectId,
    format: 'ONE_TO_ONE',
    status: 'PENDING_ADMIN_APPROVAL',
    targetGroupSize: null,
    groupFormationWindowExpiresAt: null,
    sessionsPerWeek: null,
    adminApprovedAt: null,
    adminApprovedById: null,
    adminOverdueNotifiedAt: null,
    studentDelayNotifiedAt: null,
    endedAt: null,
    endedReason: null,
    createdAt,
    updatedAt: createdAt,
  };
  return withOverrides(base, overrides);
}

/** Required overrides: `cohortId`, `studentId`. `status` defaults `PENDING_PAYMENT`. */
export function buildCohortMembership(
  overrides: Partial<CohortMembership> & { cohortId: string; studentId: string },
): CohortMembership {
  const base: CohortMembership = {
    id: freshId(),
    cohortId: overrides.cohortId,
    studentId: overrides.studentId,
    status: 'PENDING_PAYMENT',
    billingCycleAnchorDate: null,
    joinedAt: now(),
    endedAt: null,
    endReason: null,
  };
  return withOverrides(base, overrides);
}

/**
 * Required overrides: `studentId`, `fromMembershipId`, `fromFormat`,
 * `toFormat`. `requestedAt` defaults now.
 */
export function buildFormatSwitchRequest(
  overrides: Partial<FormatSwitchRequest> & {
    studentId: string;
    fromMembershipId: string;
    fromFormat: FormatSwitchRequest['fromFormat'];
    toFormat: FormatSwitchRequest['toFormat'];
  },
): FormatSwitchRequest {
  const base: FormatSwitchRequest = {
    id: freshId(),
    studentId: overrides.studentId,
    fromMembershipId: overrides.fromMembershipId,
    fromFormat: overrides.fromFormat,
    toFormat: overrides.toFormat,
    newMatchRequestId: null,
    refundId: null,
    requestedAt: now(),
    completedAt: null,
  };
  return withOverrides(base, overrides);
}
