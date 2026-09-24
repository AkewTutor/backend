import { z } from 'zod';

export const submitAssessmentSchema = z.object({
  body: z.object({
    cohortMembershipId: z.string().uuid(),
    weekStartDate: z.string(),
    tutorFeedback: z.string().min(1),
    scoreSummary: z.string().optional(),
  }),
});
