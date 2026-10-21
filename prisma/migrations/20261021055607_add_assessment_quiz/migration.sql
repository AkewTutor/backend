-- CreateTable
CREATE TABLE "AssessmentQuiz" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "instructions" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "createdByTutorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "cohortMembershipId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuiz_cohortId_weekStartDate_key" ON "AssessmentQuiz"("cohortId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_quizId_cohortMembershipId_key" ON "AssessmentAttempt"("quizId", "cohortMembershipId");

-- AddForeignKey
ALTER TABLE "AssessmentQuiz" ADD CONSTRAINT "AssessmentQuiz_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuiz" ADD CONSTRAINT "AssessmentQuiz_createdByTutorId_fkey" FOREIGN KEY ("createdByTutorId") REFERENCES "TutorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "AssessmentQuiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_cohortMembershipId_fkey" FOREIGN KEY ("cohortMembershipId") REFERENCES "CohortMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
