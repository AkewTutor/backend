/*
  Warnings:

  - The values [PENDING] on the enum `CohortStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [FAILED,REFUNDED] on the enum `MembershipStatus` will be removed. If these variants are still used in the database, this will fail.
  - The `endedReason` column on the `Cohort` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `endReason` column on the `CohortMembership` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "MatchPath" AS ENUM ('PATH_A', 'PATH_B', 'PATH_C');

-- CreateEnum
CREATE TYPE "MatchRequestStatus" AS ENUM ('SEARCHING', 'ZERO_MATCH_PENDING', 'PENDING_ADMIN_ASSIGNMENT', 'MATCHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExclusionReason" AS ENUM ('ADMIN_REJECTED');

-- CreateEnum
CREATE TYPE "CohortEndReason" AS ENUM ('COMPLETED', 'TUTOR_DROPOUT', 'TUTOR_SUSPENDED', 'FORMAT_SWITCH', 'ADMIN_REJECTED');

-- CreateEnum
CREATE TYPE "MembershipEndReason" AS ENUM ('COMPLETED', 'FORMAT_SWITCH', 'DROPPED_BY_ADMIN');

-- AlterEnum
BEGIN;
CREATE TYPE "CohortStatus_new" AS ENUM ('FORMING', 'PENDING_ADMIN_APPROVAL', 'PENDING_PAYMENT', 'ACTIVE', 'ENDED', 'CANCELLED');
ALTER TABLE "public"."Cohort" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Cohort" ALTER COLUMN "status" TYPE "CohortStatus_new" USING ("status"::text::"CohortStatus_new");
ALTER TYPE "CohortStatus" RENAME TO "CohortStatus_old";
ALTER TYPE "CohortStatus_new" RENAME TO "CohortStatus";
DROP TYPE "public"."CohortStatus_old";
ALTER TABLE "Cohort" ALTER COLUMN "status" SET DEFAULT 'FORMING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "MembershipStatus_new" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'ENDED');
ALTER TABLE "public"."CohortMembership" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CohortMembership" ALTER COLUMN "status" TYPE "MembershipStatus_new" USING ("status"::text::"MembershipStatus_new");
ALTER TYPE "MembershipStatus" RENAME TO "MembershipStatus_old";
ALTER TYPE "MembershipStatus_new" RENAME TO "MembershipStatus";
DROP TYPE "public"."MembershipStatus_old";
ALTER TABLE "CohortMembership" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';
COMMIT;

-- AlterTable
ALTER TABLE "Cohort" ALTER COLUMN "status" SET DEFAULT 'FORMING',
DROP COLUMN "endedReason",
ADD COLUMN     "endedReason" "CohortEndReason";

-- AlterTable
ALTER TABLE "CohortMembership" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT',
DROP COLUMN "endReason",
ADD COLUMN     "endReason" "MembershipEndReason";

-- CreateTable
CREATE TABLE "MatchRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "tutorId" TEXT,
    "format" "TutoringFormat" NOT NULL,
    "path" "MatchPath" NOT NULL,
    "status" "MatchRequestStatus" NOT NULL DEFAULT 'SEARCHING',
    "zeroMatchSince" TIMESTAMP(3),
    "resultingCohortId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorExclusion" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "reason" "ExclusionReason" NOT NULL DEFAULT 'ADMIN_REJECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormatSwitchRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromMembershipId" TEXT NOT NULL,
    "fromFormat" "TutoringFormat" NOT NULL,
    "toFormat" "TutoringFormat" NOT NULL,
    "newMatchRequestId" TEXT,
    "refundId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FormatSwitchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingConfig" (
    "id" TEXT NOT NULL,
    "format" "TutoringFormat" NOT NULL,
    "pricePerStudentPerHour" DECIMAL(65,30) NOT NULL,
    "totalPerHour" DECIMAL(65,30) NOT NULL,
    "platformSharePerHour" DECIMAL(65,30) NOT NULL,
    "tutorSharePerHour" DECIMAL(65,30) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorExclusion_studentId_tutorId_key" ON "TutorExclusion"("studentId", "tutorId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingConfig_format_key" ON "PricingConfig"("format");

-- AddForeignKey
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_adminApprovedById_fkey" FOREIGN KEY ("adminApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRequest" ADD CONSTRAINT "MatchRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRequest" ADD CONSTRAINT "MatchRequest_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRequest" ADD CONSTRAINT "MatchRequest_resultingCohortId_fkey" FOREIGN KEY ("resultingCohortId") REFERENCES "Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorExclusion" ADD CONSTRAINT "TutorExclusion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorExclusion" ADD CONSTRAINT "TutorExclusion_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "TutorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormatSwitchRequest" ADD CONSTRAINT "FormatSwitchRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormatSwitchRequest" ADD CONSTRAINT "FormatSwitchRequest_fromMembershipId_fkey" FOREIGN KEY ("fromMembershipId") REFERENCES "CohortMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormatSwitchRequest" ADD CONSTRAINT "FormatSwitchRequest_newMatchRequestId_fkey" FOREIGN KEY ("newMatchRequestId") REFERENCES "MatchRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingConfig" ADD CONSTRAINT "PricingConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
