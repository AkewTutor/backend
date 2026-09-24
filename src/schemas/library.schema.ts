import { z } from 'zod';

export const uploadMaterialSchema = z.object({
  body: z.object({
    cohortId: z.string().uuid('Invalid cohort ID'),
    title: z.string().min(1, 'Title is required'),
    fileType: z.enum(['PDF', 'NOTE', 'BOOK']),
  }),
});
