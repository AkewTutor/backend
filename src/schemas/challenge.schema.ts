import { z } from 'zod';

export const createChallengeSchema = z.object({
  body: z
    .object({
      title: z.string().min(1),
      description: z.string().min(1),
      period: z.enum(['WEEKLY', 'MONTHLY']),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      targetValue: z.number().int().positive(),
    })
    .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
      message: 'End time must be after start time',
      path: ['endsAt'],
    }),
});
