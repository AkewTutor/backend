/*
  Warnings:

  - You are about to drop the `LibraryMaterial` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Recording` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RecordingConsent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RescheduleRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ScheduledSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SessionMiss` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WeeklyAssessment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "LibraryMaterial" DROP CONSTRAINT "LibraryMaterial_cohortId_fkey";

-- DropForeignKey
ALTER TABLE "LibraryMaterial" DROP CONSTRAINT "LibraryMaterial_uploadedByTutorId_fkey";

-- DropForeignKey
ALTER TABLE "Recording" DROP CONSTRAINT "Recording_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "RecordingConsent" DROP CONSTRAINT "RecordingConsent_acknowledgedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "RecordingConsent" DROP CONSTRAINT "RecordingConsent_studentId_fkey";

-- DropForeignKey
ALTER TABLE "RecordingConsent" DROP CONSTRAINT "RecordingConsent_tutorId_fkey";

-- DropForeignKey
ALTER TABLE "RescheduleRequest" DROP CONSTRAINT "RescheduleRequest_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "RescheduleRequest" DROP CONSTRAINT "RescheduleRequest_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduledSession" DROP CONSTRAINT "ScheduledSession_cohortId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduledSession" DROP CONSTRAINT "ScheduledSession_makeupForSessionId_fkey";

-- DropForeignKey
ALTER TABLE "SessionMiss" DROP CONSTRAINT "SessionMiss_makeupSessionId_fkey";

-- DropForeignKey
ALTER TABLE "SessionMiss" DROP CONSTRAINT "SessionMiss_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "WeeklyAssessment" DROP CONSTRAINT "WeeklyAssessment_cohortMembershipId_fkey";

-- DropForeignKey
ALTER TABLE "WeeklyAssessment" DROP CONSTRAINT "WeeklyAssessment_submittedByTutorId_fkey";

-- DropTable
DROP TABLE "LibraryMaterial";

-- DropTable
DROP TABLE "Recording";

-- DropTable
DROP TABLE "RecordingConsent";

-- DropTable
DROP TABLE "RescheduleRequest";

-- DropTable
DROP TABLE "ScheduledSession";

-- DropTable
DROP TABLE "SessionMiss";

-- DropTable
DROP TABLE "WeeklyAssessment";

-- DropEnum
DROP TYPE "MaterialFileType";

-- DropEnum
DROP TYPE "MissCause";

-- DropEnum
DROP TYPE "MissType";

-- DropEnum
DROP TYPE "RecordingUploadStatus";

-- DropEnum
DROP TYPE "RescheduleClassification";

-- DropEnum
DROP TYPE "SessionStatus";
