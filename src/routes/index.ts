// src/routes/index.ts
import { Router } from 'express';

import { adminAnnouncementRouter } from './adminAnnouncement.routes.js';
import { authRouter } from './auth.routes.js';
import { notificationRouter } from './notification.routes.js';
import { policyRouter } from './policy.routes.js';
import studentProfileRouter from './studentProfile.routes.js';
import guardianshipRouter from './guardianship.routes.js';
import tutorProfileRouter from './tutorProfile.routes.js';
import availabilityRouter from './availability.routes.js';
import { subjectRouter, adminSubjectRouter } from './subject.routes.js';
import adminTutorVerificationRouter from './adminTutorVerification.routes.js';
import adminPeopleRouter from './adminPeople.routes.js';
import matchingRouter from './matching.routes.js';
import cohortRouter from './cohort.routes.js';
import adminMatchingRouter from './adminMatching.routes.js';
import formatSwitchRouter from './formatSwitch.routes.js';
import sessionRouter from './session.routes.js';
import rescheduleRouter from './reschedule.routes.js';
import weeklyAssessmentRouter from './weeklyAssessment.routes.js';
import messagingRouter from './messaging.routes.js';
import adminMessagingRouter from './adminMessaging.routes.js';
import recordingConsentRouter from './recordingConsent.routes.js';
import sessionMissRouter from './sessionMiss.routes.js';
import recordingRouter from './recording.routes.js';
import { libraryRouter, adminLibraryRouter } from './library.routes.js';
import { gamificationXPRouter, adminXPRouter } from './xp.routes.js';
import { gamificationBadgeRouter, adminBadgeRouter } from './badge.routes.js';
import { gamificationChallengeRouter, adminChallengeRouter } from './challenge.routes.js';
import paymentRouter from './payment.routes.js';
import { pricingRouter, adminPricingRouter } from './pricing.routes.js';
import { adminRefundRouter } from './refund.routes.js';
import { adminPayoutRouter } from './payout.routes.js';
import paymentPauseRouter from './paymentPause.routes.js';
import { publicPromotionRouter, adminPromotionRouter } from './promotion.routes.js';
import { adminDisputeRouter } from './adminDispute.routes.js';
import { adminReportingRouter } from './adminReporting.routes.js';
import earningRouter from './earning.routes.js';
import { complaintRouter, supportRouter } from './complaint.routes.js';

const router = Router();

// ── shared-config ─────────────────────────────────────────────────
router.use('/auth', authRouter);
router.use('/notifications', notificationRouter);
router.use('/admin/announcements', adminAnnouncementRouter);
router.use('/policies', policyRouter);

// ── accounts-guardianship ─────────────────────────────────────────
router.use('/students', studentProfileRouter);
router.use('/guardianship', guardianshipRouter);
router.use('/tutors', tutorProfileRouter);
router.use('/tutors', availabilityRouter);
router.use('/subjects', subjectRouter);
router.use('/admin/subjects', adminSubjectRouter);
router.use('/admin/tutors', adminTutorVerificationRouter);
router.use('/admin/people', adminPeopleRouter);

// ── matching-cohorts ──────────────────────────────────────────────
router.use('/matching', matchingRouter);
router.use('/cohorts', cohortRouter);
router.use('/admin/matching', adminMatchingRouter);
router.use('/format-switch', formatSwitchRouter);

// ── class-delivery-library ─────────────────────────────────────────
router.use('/sessions', sessionRouter);
router.use('/reschedule', rescheduleRouter);
router.use('/assessments', weeklyAssessmentRouter);
router.use('/messaging', messagingRouter);
router.use('/admin/messaging', adminMessagingRouter);
router.use('/recording-consent', recordingConsentRouter);
router.use('/session-miss', sessionMissRouter);
router.use('/recordings', recordingRouter);
router.use('/library', libraryRouter);
router.use('/admin/library', adminLibraryRouter);

// ── gamification-engagement ────────────────────────────────────────
router.use('/gamification', gamificationXPRouter);
router.use('/admin/students', adminXPRouter);
router.use('/gamification/badges', gamificationBadgeRouter);
router.use('/admin/badges', adminBadgeRouter);
router.use('/gamification/challenges', gamificationChallengeRouter);
router.use('/admin/challenges', adminChallengeRouter);

// ── payments-earnings ─────────────────────────────────────────────
router.use('/payments', paymentRouter);
router.use('/payment-pause', paymentPauseRouter);
router.use('/promotions', publicPromotionRouter);
router.use('/pricing', pricingRouter);
router.use('/admin/pricing', adminPricingRouter);
router.use('/admin/refunds', adminRefundRouter);
router.use('/admin/promotions', adminPromotionRouter);
router.use('/admin/payouts', adminPayoutRouter);
router.use('/admin/disputes', adminDisputeRouter);
router.use('/admin/reports', adminReportingRouter);
router.use('/tutors', earningRouter);
router.use('/complaints', complaintRouter);
router.use('/support', supportRouter);
export default router;
