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

export default router;
