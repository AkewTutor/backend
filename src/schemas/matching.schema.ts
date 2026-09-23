import { z } from 'zod';

export const searchTutorsQuerySchema = z.object({
  query: z.object({
    subjectId: z.string().uuid(),
    grade: z.coerce.number().min(1).max(12),
    studentId: z.string().uuid().optional(),
    budget: z.string().max(50).optional(),
    language: z.string().max(50).optional(),
    priceMax: z.string().max(50).optional(),
    scheduleAvailability: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export const selectTutorSchema = z.object({
  body: z.object({
    tutorId: z.string().uuid(),
    studentId: z.string().uuid().optional(),
  }),
});

export const noExactMatchSchema = z.object({
  body: z
    .object({
      studentId: z.string().uuid().optional(),
    })
    .default({}),
});
