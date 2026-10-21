-- DropIndex
DROP INDEX "AssessmentAttempt_quizId_cohortMembershipId_key";

-- DropIndex
DROP INDEX "AssessmentQuiz_cohortId_weekStartDate_key";

-- AlterTable
ALTER TABLE "AssessmentAttempt" ADD COLUMN     "supersededAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AssessmentQuiz" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AssessmentAttempt_quizId_cohortMembershipId_idx" ON "AssessmentAttempt"("quizId", "cohortMembershipId");

-- CreateIndex
CREATE INDEX "AssessmentQuiz_cohortId_weekStartDate_idx" ON "AssessmentQuiz"("cohortId", "weekStartDate");
