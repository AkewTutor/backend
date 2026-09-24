import { z } from 'zod';

export const createBadgeSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    category: z.enum(['STUDENT', 'TUTOR']),
    criteriaDescription: z.string().min(1),
    isActive: z.boolean().optional(),
  }),
});

export const updateBadgeSchema = z.object({
  body: z.object({
    isActive: z.boolean().optional(),
    criteriaDescription: z.string().min(1).optional(),
  }),
});
