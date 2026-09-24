-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'MISSED', 'RESCHEDULED', 'PAYMENT_PAUSE_RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecordingUploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'MISSING', 'ESCALATED');

-- CreateEnum
CREATE TYPE "RescheduleClassification" AS ENUM ('FREE_RESCHEDULE', 'SAME_DAY_MISS');

-- CreateEnum
CREATE TYPE "MissCause" AS ENUM ('TUTOR', 'STUDENT');

-- CreateEnum
CREATE TYPE "MissType" AS ENUM ('NO_SHOW', 'LATE_CANCELLATION', 'TECHNICAL_FAILURE');

-- CreateEnum
CREATE TYPE "MaterialFileType" AS ENUM ('PDF', 'NOTE', 'BOOK');

-- CreateTable
CREATE TABLE "ScheduledSession" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "jitsiLinkUrl" TEXT,
    "jitsiLinkSentAt" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "isMakeup" BOOLEAN NOT NULL DEFAULT false,
    "makeupForSessionId" TEXT,
    "recordingStatus" "RecordingUploadStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RescheduleRequest" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedNewStart" TIMESTAMP(3) NOT NULL,
    "noticeHours" DECIMAL(65,30) NOT NULL,
    "classification" "RescheduleClassification" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RescheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionMiss" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "causedBy" "MissCause" NOT NULL,
    "missType" "MissType" NOT NULL,
    "makeupSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionMiss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingConsent" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorAcknowledgedAt" TIMESTAMP(3),
    "studentOrParentAcknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "encoding" TEXT NOT NULL DEFAULT '720p',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "keepPermanently" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryMaterial" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "uploadedByTutorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" "MaterialFileType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAssessment" (
    "id" TEXT NOT NULL,
    "cohortMembershipId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "scoreSummary" TEXT,
    "tutorFeedback" TEXT NOT NULL,
    "submittedByTutorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionMiss_sessionId_key" ON "SessionMiss"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordingConsent_tutorId_studentId_key" ON "RecordingConsent"("tutorId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Recording_sessionId_key" ON "Recording"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyAssessment_cohortMembershipId_weekStartDate_key" ON "WeeklyAssessment"("cohortMembershipId", "weekStartDate");

-- AddForeignKey
ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_makeupForSessionId_fkey" FOREIGN KEY ("makeupForSessionId") REFERENCES "ScheduledSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScheduledSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionMiss" ADD CONSTRAINT "SessionMiss_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScheduledSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingConsent" ADD CONSTRAINT "RecordingConsent_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "TutorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingConsent" ADD CONSTRAINT "RecordingConsent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingConsent" ADD CONSTRAINT "RecordingConsent_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScheduledSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryMaterial" ADD CONSTRAINT "LibraryMaterial_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryMaterial" ADD CONSTRAINT "LibraryMaterial_uploadedByTutorId_fkey" FOREIGN KEY ("uploadedByTutorId") REFERENCES "TutorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyAssessment" ADD CONSTRAINT "WeeklyAssessment_cohortMembershipId_fkey" FOREIGN KEY ("cohortMembershipId") REFERENCES "CohortMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyAssessment" ADD CONSTRAINT "WeeklyAssessment_submittedByTutorId_fkey" FOREIGN KEY ("submittedByTutorId") REFERENCES "TutorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
