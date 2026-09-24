import { z } from 'zod';

export const sendMessageSchema = z.object({
  params: z.object({
    cohortId: z.string().uuid(),
  }),
  body: z.object({
    body: z.string().min(1).max(2000),
  }),
});
