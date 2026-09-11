/**
 * tests/factories/types.ts
 *
 * Local, hand-authored mirror of the entity/enum shapes defined in
 * `docs/04-database-and-data-model.md §4.2`.
 *
 * WHY THIS FILE EXISTS (read before "fixing" it):
 * Per `AKEWTutor-Backend-Test-Implementation-Journey.md` §0, every phase
 * assumes `prisma/schema.prisma` already exists. In this repo it does not
 * yet — it is still the bare `template-node-express` placeholder with zero
 * models. `schema.prisma` is explicitly declarative/non-test-driven
 * (Test File Map "Not required" row in every 09-N doc), so it is never
 * produced *by* a test file. Until it's authored and `prisma generate` has
 * run, `@prisma/client` exports no `User`, `StudentProfile`, etc. types —
 * so factories cannot import them.
 *
 * These interfaces are therefore the source of truth fixtures compile
 * against for now. They are a byte-for-byte mirror of Doc 04 §4.2's field
 * tables. Once `schema.prisma` is written (a separate, non-test-driven
 * task), swap every import below for `import type { X } from '@prisma/client'`
 * and delete the duplicated shape here — do NOT let the two drift in the
 * meantime; any field added to Doc 04 gets added here in the same PR
 * (mirrors the discipline `00-test-fixtures.md` §5 asks of the factories
 * themselves for a genuinely new entity shape).
 *
 * Money fields are typed `string` (decimal-safe), never `number` —
 * `00-test-fixtures.md` §1.2.
 */

// ---------------------------------------------------------------------------
// 4.2.1 Identity & Accounts
// ---------------------------------------------------------------------------

export type UserRole = 'STUDENT' | 'PARENT' | 'TUTOR' | 'ADMIN';
export type NotifChannel = 'PUSH' | 'SMS' | 'EMAIL';

export interface User {
  id: string;
  role: UserRole;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  preferredNotificationChannel: NotifChannel | null;
  termsAcceptedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type StudentAccountStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'GUARDIAN_REQUIRED_HOLD';
export type TutoringFormat = 'ONE_TO_ONE' | 'ONE_TO_THREE' | 'ONE_TO_FIVE';

export interface StudentProfile {
  id: string;
  userId: string;
  grade: number;
  school: string | null;
  profilePictureUrl: string | null;
  subjectsOfInterest: string[];
  academicLevel: string | null;
  learningGoals: string | null;
  preferredLanguage: string;
  learningSchedulePreference: Record<string, unknown> | null;
  teachingStylePreference: string | null;
  budgetPreference: string | null;
  formatPreference: TutoringFormat | null;
  accountStatus: StudentAccountStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type ParentOnboardingStatus = 'PENDING' | 'COMPLETE';

export interface ParentProfile {
  id: string;
  userId: string;
  profilePictureUrl: string | null;
  onboardingStatus: ParentOnboardingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type TutorVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface TutorProfile {
  id: string;
  userId: string;
  profilePictureUrl: string | null;
  bio: string | null;
  experienceDescription: string;
  educationInstitution: string | null;
  degree: string | null;
  verificationStatus: TutorVerificationStatus;
  verifiedAt: Date | null;
  verifiedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RelationshipType = 'MANDATORY_GUARDIAN' | 'OPTIONAL_GUARDIAN';
export type RelationshipStatus = 'INVITED' | 'ACTIVE' | 'REVOKED';

export interface ParentStudentRelationship {
  id: string;
  parentId: string;
  studentId: string;
  relationshipType: RelationshipType;
  status: RelationshipStatus;
  permissions: Record<string, unknown>;
  invitedAt: Date;
  inviteExpiresAt: Date;
  inviteToken: string;
  activatedAt: Date | null;
  revokedAt: Date | null;
  revokedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
  createdByIp: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// 4.2.2 Catalog, Availability & Pricing
// ---------------------------------------------------------------------------

export interface Subject {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TutorSubjectRanking {
  id: string;
  tutorId: string;
  subjectId: string;
  rank: number;
  createdAt: Date;
}

export interface AvailabilitySlot {
  id: string;
  tutorId: string;
  dayOfWeek: number | null;
  startTime: Date;
  endTime: Date;
  isRecurring: boolean;
  createdAt: Date;
}

export interface PricingConfig {
  id: string;
  format: TutoringFormat;
  pricePerStudentPerHour: string;
  totalPerHour: string;
  platformSharePerHour: string;
  tutorSharePerHour: string;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// 4.2.3 Matching & Cohorts
// ---------------------------------------------------------------------------

export type MatchPath = 'PATH_A' | 'PATH_B' | 'PATH_C';
export type MatchRequestStatus =
  | 'SEARCHING'
  | 'ZERO_MATCH_PENDING'
  | 'PENDING_ADMIN_ASSIGNMENT'
  | 'MATCHED'
  | 'CANCELLED';

export interface MatchRequest {
  id: string;
  studentId: string;
  subjectId: string;
  format: TutoringFormat;
  path: MatchPath;
  status: MatchRequestStatus;
  zeroMatchSince: Date | null;
  resultingCohortId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ExclusionReason = 'ADMIN_REJECTED';

export interface TutorExclusion {
  id: string;
  studentId: string;
  tutorId: string;
  reason: ExclusionReason;
  createdAt: Date;
}

export type CohortStatus =
  | 'FORMING'
  | 'PENDING_ADMIN_APPROVAL'
  | 'PENDING_PAYMENT'
  | 'ACTIVE'
  | 'ENDED'
  | 'CANCELLED';
export type CohortEndReason =
  | 'COMPLETED'
  | 'TUTOR_DROPOUT'
  | 'TUTOR_SUSPENDED'
  | 'FORMAT_SWITCH'
  | 'ADMIN_REJECTED';

export interface Cohort {
  id: string;
  tutorId: string;
  subjectId: string;
  format: TutoringFormat;
  status: CohortStatus;
  targetGroupSize: number | null;
  groupFormationWindowExpiresAt: Date | null;
  sessionsPerWeek: number | null;
  adminApprovedAt: Date | null;
  adminApprovedById: string | null;
  adminOverdueNotifiedAt: Date | null;
  studentDelayNotifiedAt: Date | null;
  endedAt: Date | null;
  endedReason: CohortEndReason | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MembershipStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'ENDED';
export type MembershipEndReason = 'COMPLETED' | 'FORMAT_SWITCH' | 'DROPPED_BY_ADMIN';

export interface CohortMembership {
  id: string;
  cohortId: string;
  studentId: string;
  status: MembershipStatus;
  billingCycleAnchorDate: Date | null;
  joinedAt: Date;
  endedAt: Date | null;
  endReason: MembershipEndReason | null;
}

export interface FormatSwitchRequest {
  id: string;
  studentId: string;
  fromMembershipId: string;
  fromFormat: TutoringFormat;
  toFormat: TutoringFormat;
  newMatchRequestId: string | null;
  refundId: string | null;
  requestedAt: Date;
  completedAt: Date | null;
}

// ---------------------------------------------------------------------------
// 4.2.4 Class Delivery
// ---------------------------------------------------------------------------

export type SessionStatus =
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'MISSED'
  | 'RESCHEDULED'
  | 'PAYMENT_PAUSE_RESCHEDULED'
  | 'CANCELLED';
export type RecordingUploadStatus = 'PENDING' | 'UPLOADED' | 'MISSING' | 'ESCALATED';

export interface ScheduledSession {
  id: string;
  cohortId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  jitsiLinkUrl: string | null;
  jitsiLinkSentAt: Date | null;
  status: SessionStatus;
  isMakeup: boolean;
  makeupForSessionId: string | null;
  recordingStatus: RecordingUploadStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type RescheduleClassification = 'FREE_RESCHEDULE' | 'SAME_DAY_MISS';

export interface RescheduleRequest {
  id: string;
  sessionId: string;
  requestedById: string;
  requestedNewStart: Date;
  noticeHours: string;
  classification: RescheduleClassification;
  createdAt: Date;
}

export type MissCause = 'TUTOR' | 'STUDENT';
export type MissType = 'NO_SHOW' | 'LATE_CANCELLATION' | 'TECHNICAL_FAILURE';

export interface SessionMiss {
  id: string;
  sessionId: string;
  causedBy: MissCause;
  missType: MissType;
  makeupSessionId: string | null;
  createdAt: Date;
}

export interface RecordingConsent {
  id: string;
  tutorId: string;
  studentId: string;
  tutorAcknowledgedAt: Date | null;
  studentOrParentAcknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  createdAt: Date;
}

export interface Recording {
  id: string;
  sessionId: string;
  storageKey: string;
  fileSizeBytes: number;
  encoding: string;
  createdAt: Date;
  expiresAt: Date;
  keepPermanently: boolean;
  deletedAt: Date | null;
}

export type MaterialFileType = 'PDF' | 'NOTE' | 'BOOK';

export interface LibraryMaterial {
  id: string;
  cohortId: string;
  uploadedByTutorId: string;
  title: string;
  fileUrl: string;
  fileType: MaterialFileType;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// 4.2.5 Assessment
// ---------------------------------------------------------------------------

export interface WeeklyAssessment {
  id: string;
  cohortMembershipId: string;
  weekStartDate: Date;
  scoreSummary: string | null;
  tutorFeedback: string;
  submittedByTutorId: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// 4.2.6 Messaging
// ---------------------------------------------------------------------------

export type ThreadStatus = 'ACTIVE' | 'ARCHIVED' | 'CLOSED_BY_ADMIN';

export interface MessageThread {
  id: string;
  cohortId: string;
  status: ThreadStatus;
  archivedAt: Date | null;
  closedById: string | null;
  closedAt: Date | null;
  createdAt: Date;
}

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// 4.2.7 Payments, Billing & Earnings
// ---------------------------------------------------------------------------

export type PaymentProvider = 'CHAPA';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface Payment {
  id: string;
  cohortMembershipId: string;
  amount: string;
  provider: PaymentProvider;
  providerTransactionId: string | null;
  status: PaymentStatus;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  createdAt: Date;
}

export type PauseReason = 'NONPAYMENT';

export interface PaymentPause {
  id: string;
  cohortMembershipId: string;
  startedAt: Date;
  endedAt: Date | null;
  reason: PauseReason;
}

export type RefundReason =
  | 'TUTOR_DROPOUT'
  | 'PLATFORM_OUTAGE'
  | 'FORMAT_SWITCH'
  | 'SESSION_UNDELIVERED'
  | 'ADMIN_DISPUTE_RESOLUTION';
export type RefundStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Refund {
  id: string;
  paymentId: string;
  reason: RefundReason;
  status: RefundStatus;
  sessionsRemaining: number;
  totalSessionsBilled: number;
  amount: string;
  approvedById: string | null;
  approvedAt: Date | null;
  rejectedById: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
}

export type EarningRateType = 'FULL' | 'REDUCED_MAKEUP';

export interface TutorEarning {
  id: string;
  tutorId: string;
  sessionId: string;
  amount: string;
  rateType: EarningRateType;
  payoutId: string | null;
  createdAt: Date;
}

export type PayoutStatus = 'PENDING' | 'PAID';

export interface Payout {
  id: string;
  tutorId: string;
  periodStart: Date;
  periodEnd: Date;
  totalAmount: string;
  status: PayoutStatus;
  paidAt: Date | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// 4.2.8 Gamification
// ---------------------------------------------------------------------------

export type XPReason =
  | 'CLASS_ATTENDED'
  | 'ASSESSMENT_COMPLETED'
  | 'STREAK_MILESTONE'
  | 'CHALLENGE_COMPLETED'
  | 'BADGE_AWARDED'
  | 'OTHER';

export interface XPLedgerEntry {
  id: string;
  studentId: string;
  amount: number;
  reason: XPReason;
  note: string | null;
  createdAt: Date;
}

export type BadgeCategory = 'STUDENT' | 'TUTOR';

export interface Badge {
  id: string;
  name: string;
  description: string;
  category: BadgeCategory;
  criteriaDescription: string;
  isActive: boolean;
  createdAt: Date;
}

export interface StudentBadge {
  id: string;
  studentId: string;
  badgeId: string;
  earnedAt: Date;
}

export interface TutorBadge {
  id: string;
  tutorId: string;
  badgeId: string;
  earnedAt: Date;
}

export interface Streak {
  id: string;
  studentId: string;
  currentStreakDays: number;
  longestStreakDays: number;
  lastActivityDate: Date | null;
}

export type ChallengePeriod = 'WEEKLY' | 'MONTHLY';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  period: ChallengePeriod;
  startsAt: Date;
  endsAt: Date;
  targetValue: number;
  createdById: string;
  createdAt: Date;
}

export interface ChallengeProgress {
  id: string;
  studentId: string;
  challengeId: string;
  progressValue: number;
  completedAt: Date | null;
}

// ---------------------------------------------------------------------------
// 4.2.9 Support, Trust & Platform Content
// ---------------------------------------------------------------------------

export type ComplaintCategory =
  | 'SESSION_ISSUE'
  | 'TUTOR_CONDUCT'
  | 'PAYMENT_ISSUE'
  | 'MESSAGE_ISSUE'
  | 'OTHER';
export type ComplaintStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
/**
 * Phase 8 addition — not in 04-database-and-data-model.md §4.2.9's field
 * table, but required by 06-api/08-support-trust-admin-api.md's
 * PATCH/GET /admin/disputes/:complaintId response shapes and by
 * 09-8-support-trust-admin.md §9.5's resolveDispute test cases. Doc 04's
 * table appears to have simply omitted these two columns when the
 * resolution-action detail was added elsewhere in the doc set; recorded
 * here as a known gap for whoever next touches Doc 04, not silently
 * absorbed. See 08-function-level-specification/backend/8-8's resolveDispute
 * "Side effects" row: "Sets status, resolutionAction, resolutionNotes...".
 */
export type ResolutionAction = 'NO_ACTION' | 'WARNING_ISSUED' | 'REFUND_ISSUED' | 'TUTOR_SUSPENDED';

export interface ComplaintReport {
  id: string;
  reporterId: string;
  relatedCohortId: string | null;
  relatedSessionId: string | null;
  relatedPaymentId: string | null;
  relatedThreadId: string | null;
  category: ComplaintCategory;
  description: string;
  status: ComplaintStatus;
  resolutionAction: ResolutionAction | null;
  resolutionNotes: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export type PolicyType = 'PRIVACY' | 'TERMS' | 'SAFETY' | 'REFUND' | 'RULES';

export interface PolicyDocument {
  id: string;
  type: PolicyType;
  content: string;
  version: number;
  publishedById: string;
  publishedAt: Date;
  createdAt: Date;
}

export type DiscountType = 'PERCENT' | 'FIXED_ETB';

export interface PromotionCode {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: string;
  validFrom: Date;
  validTo: Date;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// 4.2.10 Notifications
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'REGISTRATION_COMPLETE'
  | 'TUTOR_VERIFICATION_APPROVED'
  | 'TUTOR_VERIFICATION_REJECTED'
  | 'MATCH_FOUND'
  | 'MATCH_REJECTED'
  | 'BOOKING_CONFIRMED'
  | 'PAYMENT_RECEIVED'
  | 'CLASS_REMINDER'
  | 'CLASS_CANCELLED'
  | 'CLASS_RESCHEDULED'
  | 'MAKEUP_SCHEDULED'
  | 'ASSESSMENT_AVAILABLE'
  | 'WEEKLY_SUMMARY'
  | 'RECORDING_AVAILABLE'
  | 'MATERIAL_UPLOADED'
  | 'BADGE_EARNED'
  | 'LEADERBOARD_CHANGE'
  | 'EARNING_CREDITED'
  | 'PAYOUT_PROCESSED'
  | 'COMPLAINT_STATUS_UPDATE'
  | 'COMPLAINT_RESOLVED'
  | 'PLATFORM_ANNOUNCEMENT'
  | 'NEW_MESSAGE'
  | 'ADMIN_REVIEW_REQUIRED';

export type NotificationStatus = 'QUEUED' | 'SENT' | 'FAILED';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  channel: NotifChannel;
  status: NotificationStatus;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

/** Rule 10 / `00-agent-rules.md` "Audit-log test convention" — pinned call shape. */
export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: Date;
}
