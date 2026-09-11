/**
 * tests/factories/class-delivery-library.factory.ts
 *
 * Owns: ScheduledSession, RescheduleRequest, SessionMiss, RecordingConsent,
 * Recording, LibraryMaterial, WeeklyAssessment
 * Ref: 00-test-fixtures.md §2 "class-delivery-library"
 *
 * Phase 0, step 0.6 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 */

import { addDays, addHours, freshId, now, withOverrides } from './_helpers.js';
import type {
  LibraryMaterial,
  Recording,
  RecordingConsent,
  RescheduleRequest,
  ScheduledSession,
  SessionMiss,
  WeeklyAssessment,
} from './types.js';

/**
 * Required override: `cohortId`. `status` defaults `SCHEDULED`;
 * `recordingStatus` defaults `PENDING`; `scheduledStart`/`scheduledEnd`
 * default a 1-hour window starting 24h from now (avoids accidental
 * past-dated defaults tripping "must be ≥30 min before start" style
 * assertions).
 */
export function buildScheduledSession(
  overrides: Partial<ScheduledSession> & { cohortId: string },
): ScheduledSession {
  const createdAt = now();
  const scheduledStart = overrides.scheduledStart ?? addHours(createdAt, 24);
  const base: ScheduledSession = {
    id: freshId(),
    cohortId: overrides.cohortId,
    scheduledStart,
    scheduledEnd: addHours(scheduledStart, 1),
    jitsiLinkUrl: null,
    jitsiLinkSentAt: null,
    status: 'SCHEDULED',
    isMakeup: false,
    makeupForSessionId: null,
    recordingStatus: 'PENDING',
    createdAt,
    updatedAt: createdAt,
  };
  return withOverrides(base, overrides);
}

/**
 * Required overrides: `sessionId`, `requestedById`, `requestedNewStart`.
 * `noticeHours` defaults computed from `requestedNewStart` vs. now if not
 * passed; `classification` defaults `FREE_RESCHEDULE` when the
 * computed/passed `noticeHours` ≥ 12, else `SAME_DAY_MISS`.
 */
export function buildRescheduleRequest(
  overrides: Partial<RescheduleRequest> & {
    sessionId: string;
    requestedById: string;
    requestedNewStart: Date;
  },
): RescheduleRequest {
  const createdAt = now();
  const computedNoticeHours =
    (overrides.requestedNewStart.getTime() - createdAt.getTime()) / (60 * 60 * 1000);
  const noticeHours = overrides.noticeHours ?? computedNoticeHours.toFixed(2);
  const classification: RescheduleRequest['classification'] =
    Number(noticeHours) >= 12 ? 'FREE_RESCHEDULE' : 'SAME_DAY_MISS';
  const base: RescheduleRequest = {
    id: freshId(),
    sessionId: overrides.sessionId,
    requestedById: overrides.requestedById,
    requestedNewStart: overrides.requestedNewStart,
    noticeHours,
    classification,
    createdAt,
  };
  return withOverrides(base, overrides);
}

/** Required override: `sessionId`. `causedBy` defaults `TUTOR`; `missType` defaults `NO_SHOW`. */
export function buildSessionMiss(
  overrides: Partial<SessionMiss> & { sessionId: string },
): SessionMiss {
  const base: SessionMiss = {
    id: freshId(),
    sessionId: overrides.sessionId,
    causedBy: 'TUTOR',
    missType: 'NO_SHOW',
    makeupSessionId: null,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/**
 * Required overrides: `tutorId`, `studentId`. Both acknowledgment
 * timestamps default `null` (incomplete) — pass both explicitly to get a
 * consent-complete fixture.
 */
export function buildRecordingConsent(
  overrides: Partial<RecordingConsent> & { tutorId: string; studentId: string },
): RecordingConsent {
  const base: RecordingConsent = {
    id: freshId(),
    tutorId: overrides.tutorId,
    studentId: overrides.studentId,
    tutorAcknowledgedAt: null,
    studentOrParentAcknowledgedAt: null,
    acknowledgedByUserId: null,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/**
 * Required override: `sessionId`. `encoding` defaults `"720p"`; `expiresAt`
 * defaults `createdAt` + 90 days; `keepPermanently` defaults `false`.
 */
export function buildRecording(overrides: Partial<Recording> & { sessionId: string }): Recording {
  const createdAt = now();
  const base: Recording = {
    id: freshId(),
    sessionId: overrides.sessionId,
    storageKey: `recordings/${freshId()}.mp4`,
    fileSizeBytes: 1_048_576,
    encoding: '720p',
    createdAt,
    expiresAt: addDays(createdAt, 90),
    keepPermanently: false,
    deletedAt: null,
  };
  return withOverrides(base, overrides);
}

/** Required overrides: `cohortId`, `uploadedByTutorId`. `fileType` defaults `PDF`. */
export function buildLibraryMaterial(
  overrides: Partial<LibraryMaterial> & { cohortId: string; uploadedByTutorId: string },
): LibraryMaterial {
  const base: LibraryMaterial = {
    id: freshId(),
    cohortId: overrides.cohortId,
    uploadedByTutorId: overrides.uploadedByTutorId,
    title: 'Fixture Library Material',
    fileUrl: `https://example.test/materials/${freshId()}.pdf`,
    fileType: 'PDF',
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/**
 * Required overrides: `cohortMembershipId`, `submittedByTutorId`.
 * `tutorFeedback` a placeholder string (required, not nullable).
 */
export function buildWeeklyAssessment(
  overrides: Partial<WeeklyAssessment> & {
    cohortMembershipId: string;
    submittedByTutorId: string;
  },
): WeeklyAssessment {
  const base: WeeklyAssessment = {
    id: freshId(),
    cohortMembershipId: overrides.cohortMembershipId,
    weekStartDate: now(),
    scoreSummary: null,
    tutorFeedback: 'Fixture tutor feedback placeholder.',
    submittedByTutorId: overrides.submittedByTutorId,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}
