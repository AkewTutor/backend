import { z } from 'zod';

export const adjustXPSchema = z.object({
  body: z.object({
    amount: z
      .number()
      .int()
      .refine((val) => val !== 0, {
        message: 'amount must be a non-zero integer',
      }),
    note: z.string().min(1, 'A note is required for a manual XP adjustment').max(500),
  }),
});
