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
-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'CLOSED_BY_ADMIN');

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

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "status" "ThreadStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_cohortId_key" ON "MessageThread"("cohortId");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
