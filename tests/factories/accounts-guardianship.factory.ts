/**
 * tests/factories/accounts-guardianship.factory.ts
 *
 * Owns: StudentProfile, ParentProfile, TutorProfile, ParentStudentRelationship,
 * Subject, TutorSubjectRanking, AvailabilitySlot
 * Ref: 00-test-fixtures.md §2 "accounts-guardianship"
 *
 * Phase 0, step 0.4 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 */

import { addDays, addHours, freshId, now, withOverrides } from './_helpers.js';
import type {
  AvailabilitySlot,
  ParentProfile,
  ParentStudentRelationship,
  StudentProfile,
  Subject,
  TutorProfile,
  TutorSubjectRanking,
} from './types.js';

/**
 * Required override: `userId`. `grade` defaults `8`; `accountStatus` is
 * derived from `grade` per FR-AC-002/005 (defaults `ACTIVE`, since default
 * `grade` is 6–12) — pass `grade: <1-5>` to get the `PENDING_ACTIVATION`
 * path (the factory does not re-derive `accountStatus` from a passed
 * `grade` override automatically; pass both explicitly for the Grades 1–5
 * fixture, per §1.4's "non-default state passed explicitly" rule).
 */
export function buildStudentProfile(
  overrides: Partial<StudentProfile> & { userId: string },
): StudentProfile {
  const createdAt = now();
  const base: StudentProfile = {
    id: freshId(),
    userId: overrides.userId,
    grade: 8,
    school: null,
    profilePictureUrl: null,
    subjectsOfInterest: [],
    academicLevel: null,
    learningGoals: null,
    preferredLanguage: 'English',
    learningSchedulePreference: null,
    teachingStylePreference: null,
    budgetPreference: null,
    formatPreference: null,
    accountStatus: 'ACTIVE',
    createdAt,
    updatedAt: createdAt,
  };
  return withOverrides(base, overrides);
}

/** Required override: `userId`. `onboardingStatus` defaults `PENDING`. */
export function buildParentProfile(
  overrides: Partial<ParentProfile> & { userId: string },
): ParentProfile {
  const createdAt = now();
  const base: ParentProfile = {
    id: freshId(),
    userId: overrides.userId,
    profilePictureUrl: null,
    onboardingStatus: 'PENDING',
    createdAt,
    updatedAt: createdAt,
  };
  return withOverrides(base, overrides);
}

/**
 * Required override: `userId`. `verificationStatus` defaults `PENDING`;
 * `experienceDescription` a placeholder string.
 */
export function buildTutorProfile(
  overrides: Partial<TutorProfile> & { userId: string },
): TutorProfile {
  const createdAt = now();
  const base: TutorProfile = {
    id: freshId(),
    userId: overrides.userId,
    profilePictureUrl: null,
    bio: null,
    experienceDescription: 'Fixture tutor experience description.',
    educationInstitution: null,
    degree: null,
    verificationStatus: 'PENDING',
    verifiedAt: null,
    verifiedById: null,
    createdAt,
    updatedAt: createdAt,
  };
  return withOverrides(base, overrides);
}

/**
 * Required overrides: `parentId`, `studentId`. `relationshipType` defaults
 * `MANDATORY_GUARDIAN`; `status` defaults `INVITED`; `inviteExpiresAt`
 * defaults `invitedAt` + 14 days.
 */
export function buildParentStudentRelationship(
  overrides: Partial<ParentStudentRelationship> & { parentId: string; studentId: string },
): ParentStudentRelationship {
  const invitedAt = overrides.invitedAt ?? now();
  const base: ParentStudentRelationship = {
    id: freshId(),
    parentId: overrides.parentId,
    studentId: overrides.studentId,
    relationshipType: 'MANDATORY_GUARDIAN',
    status: 'INVITED',
    permissions: {},
    invitedAt,
    inviteExpiresAt: addDays(invitedAt, 14),
    inviteToken: freshId(),
    activatedAt: null,
    revokedAt: null,
    revokedById: null,
    createdAt: invitedAt,
    updatedAt: invitedAt,
  };
  return withOverrides(base, overrides);
}

/**
 * No required overrides. `name` defaults a unique placeholder to satisfy
 * the unique constraint across repeated calls.
 */
export function buildSubject(overrides?: Partial<Subject>): Subject {
  const createdAt = now();
  const base: Subject = {
    id: freshId(),
    name: `Subject ${freshId()}`,
    isActive: true,
    createdAt,
    updatedAt: createdAt,
  };
  return withOverrides(base, overrides);
}

/** Required overrides: `tutorId`, `subjectId`. `rank` defaults `1`. */
export function buildTutorSubjectRanking(
  overrides: Partial<TutorSubjectRanking> & { tutorId: string; subjectId: string },
): TutorSubjectRanking {
  const base: TutorSubjectRanking = {
    id: freshId(),
    tutorId: overrides.tutorId,
    subjectId: overrides.subjectId,
    rank: 1,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/**
 * Required override: `tutorId`. `isRecurring` defaults `false`;
 * `startTime`/`endTime` default a 1-hour window starting now.
 */
export function buildAvailabilitySlot(
  overrides: Partial<AvailabilitySlot> & { tutorId: string },
): AvailabilitySlot {
  const startTime = overrides.startTime ?? now();
  const base: AvailabilitySlot = {
    id: freshId(),
    tutorId: overrides.tutorId,
    dayOfWeek: null,
    startTime,
    endTime: addHours(startTime, 1),
    isRecurring: false,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}
