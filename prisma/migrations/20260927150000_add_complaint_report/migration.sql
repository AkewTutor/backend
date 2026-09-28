-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('SESSION_ISSUE', 'TUTOR_CONDUCT', 'PAYMENT_ISSUE', 'MESSAGE_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ResolutionAction" AS ENUM ('NO_ACTION', 'WARNING_ISSUED', 'REFUND_ISSUED', 'TUTOR_SUSPENDED');

-- CreateTable
CREATE TABLE "ComplaintReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "relatedCohortId" TEXT,
    "relatedSessionId" TEXT,
    "relatedPaymentId" TEXT,
    "relatedThreadId" TEXT,
    "category" "ComplaintCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionAction" "ResolutionAction",
    "resolutionNotes" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintReport_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ComplaintReport" ADD CONSTRAINT "ComplaintReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintReport" ADD CONSTRAINT "ComplaintReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintReport" ADD CONSTRAINT "ComplaintReport_relatedCohortId_fkey" FOREIGN KEY ("relatedCohortId") REFERENCES "Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintReport" ADD CONSTRAINT "ComplaintReport_relatedSessionId_fkey" FOREIGN KEY ("relatedSessionId") REFERENCES "ScheduledSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintReport" ADD CONSTRAINT "ComplaintReport_relatedPaymentId_fkey" FOREIGN KEY ("relatedPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
