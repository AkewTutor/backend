import { z } from 'zod';

export const updateAcademicProfileSchema = z.object({
  body: z.object({
    studentId: z.string().uuid().optional(),
    grade: z.number().int().min(1).max(12).optional(),
    school: z.string().optional(),
    subjectsOfInterest: z.array(z.string().uuid()).optional(),
    academicLevel: z.string().optional(),
    learningGoals: z.string().optional(),
    preferredLanguage: z.string().optional(),
    learningSchedulePreference: z.object({}).passthrough().optional(),
    teachingStylePreference: z.string().optional(),
    budgetPreference: z.string().optional(),
    formatPreference: z.enum(['ONE_TO_ONE', 'ONE_TO_THREE', 'ONE_TO_FIVE']).optional(),
  }),
});
