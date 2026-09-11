/**
 * tests/factories/gamification-engagement.factory.ts
 *
 * Owns: XPLedgerEntry, Badge, StudentBadge, TutorBadge, Streak, Challenge,
 * ChallengeProgress
 * Ref: 00-test-fixtures.md §2 "gamification-engagement"
 *
 * Phase 0, step 0.8 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 */

import { freshId, now, withOverrides } from './_helpers.js';
import type {
  Badge,
  Challenge,
  ChallengeProgress,
  Streak,
  StudentBadge,
  TutorBadge,
  XPLedgerEntry,
} from './types.js';

/** Required overrides: `studentId`, `amount`. `reason` defaults `CLASS_ATTENDED`. */
export function buildXPLedgerEntry(
  overrides: Partial<XPLedgerEntry> & { studentId: string; amount: number },
): XPLedgerEntry {
  const base: XPLedgerEntry = {
    id: freshId(),
    studentId: overrides.studentId,
    amount: overrides.amount,
    reason: 'CLASS_ATTENDED',
    note: null,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/** No required overrides. `category` defaults `STUDENT`; `isActive` defaults `true`. */
export function buildBadge(overrides?: Partial<Badge>): Badge {
  const base: Badge = {
    id: freshId(),
    name: `Fixture Badge ${freshId().slice(0, 8)}`,
    description: 'Fixture badge description.',
    category: 'STUDENT',
    criteriaDescription: 'Fixture criteria description.',
    isActive: true,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/** Required overrides: `studentId`, `badgeId`. `earnedAt` defaults now. */
export function buildStudentBadge(
  overrides: Partial<StudentBadge> & { studentId: string; badgeId: string },
): StudentBadge {
  const base: StudentBadge = {
    id: freshId(),
    studentId: overrides.studentId,
    badgeId: overrides.badgeId,
    earnedAt: now(),
  };
  return withOverrides(base, overrides);
}

/** Required overrides: `tutorId`, `badgeId`. `earnedAt` defaults now. */
export function buildTutorBadge(
  overrides: Partial<TutorBadge> & { tutorId: string; badgeId: string },
): TutorBadge {
  const base: TutorBadge = {
    id: freshId(),
    tutorId: overrides.tutorId,
    badgeId: overrides.badgeId,
    earnedAt: now(),
  };
  return withOverrides(base, overrides);
}

/** Required override: `studentId`. `currentStreakDays`/`longestStreakDays` default `0`. */
export function buildStreak(overrides: Partial<Streak> & { studentId: string }): Streak {
  const base: Streak = {
    id: freshId(),
    studentId: overrides.studentId,
    currentStreakDays: 0,
    longestStreakDays: 0,
    lastActivityDate: null,
  };
  return withOverrides(base, overrides);
}

/**
 * Required overrides: `createdById`, `targetValue`. `period` defaults
 * `WEEKLY`; `startsAt`/`endsAt` default the current calendar week.
 */
export function buildChallenge(
  overrides: Partial<Challenge> & { createdById: string; targetValue: number },
): Challenge {
  const createdAt = now();
  const dayOfWeek = createdAt.getDay();
  const startsAt = new Date(createdAt);
  startsAt.setDate(createdAt.getDate() - dayOfWeek);
  startsAt.setHours(0, 0, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setDate(startsAt.getDate() + 7);

  const base: Challenge = {
    id: freshId(),
    title: 'Fixture Challenge',
    description: 'Fixture challenge description.',
    period: 'WEEKLY',
    startsAt,
    endsAt,
    targetValue: overrides.targetValue,
    createdById: overrides.createdById,
    createdAt,
  };
  return withOverrides(base, overrides);
}

/** Required overrides: `studentId`, `challengeId`. `progressValue` defaults `0`. */
export function buildChallengeProgress(
  overrides: Partial<ChallengeProgress> & { studentId: string; challengeId: string },
): ChallengeProgress {
  const base: ChallengeProgress = {
    id: freshId(),
    studentId: overrides.studentId,
    challengeId: overrides.challengeId,
    progressValue: 0,
    completedAt: null,
  };
  return withOverrides(base, overrides);
}
