/*
  Warnings:

  - The values [ENDED] on the enum `MembershipStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [SUCCEEDED,REFUNDED] on the enum `PaymentStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `cohortId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `payerId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Streak` table. All the data in the column will be lost.
  - You are about to drop the column `currentStreak` on the `Streak` table. All the data in the column will be lost.
  - Added the required column `cohortMembershipId` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MembershipStatus_new" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'FAILED', 'REFUNDED');
ALTER TABLE "public"."CohortMembership" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CohortMembership" ALTER COLUMN "status" TYPE "MembershipStatus_new" USING ("status"::text::"MembershipStatus_new");
ALTER TYPE "MembershipStatus" RENAME TO "MembershipStatus_old";
ALTER TYPE "MembershipStatus_new" RENAME TO "MembershipStatus";
DROP TYPE "public"."MembershipStatus_old";
ALTER TABLE "CohortMembership" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
ALTER TABLE "public"."Payment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "status" TYPE "PaymentStatus_new" USING ("status"::text::"PaymentStatus_new");
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "public"."PaymentStatus_old";
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_cohortId_fkey";

-- AlterTable
ALTER TABLE "Cohort" ADD COLUMN     "adminApprovedAt" TIMESTAMP(3),
ADD COLUMN     "adminApprovedById" TEXT,
ADD COLUMN     "adminOverdueNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "endedReason" TEXT,
ADD COLUMN     "groupFormationWindowExpiresAt" TIMESTAMP(3),
ADD COLUMN     "sessionsPerWeek" INTEGER,
ADD COLUMN     "studentDelayNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "targetGroupSize" INTEGER;

-- AlterTable
ALTER TABLE "CohortMembership" ADD COLUMN     "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "cohortId",
DROP COLUMN "payerId",
DROP COLUMN "studentId",
ADD COLUMN     "billingPeriodEnd" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "billingPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "cohortMembershipId" TEXT NOT NULL,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'CHAPA',
ADD COLUMN     "providerTransactionId" TEXT;

-- AlterTable
ALTER TABLE "Streak" DROP COLUMN "createdAt",
DROP COLUMN "currentStreak",
ADD COLUMN     "currentStreakDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActivityDate" TIMESTAMP(3),
ADD COLUMN     "longestStreakDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "XPLedgerEntry" ADD COLUMN     "note" TEXT,
ADD COLUMN     "reason" TEXT NOT NULL DEFAULT 'LESSON_ATTENDED';
