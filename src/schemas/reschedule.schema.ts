import { z } from 'zod';

export const requestRescheduleSchema = z.object({
  body: z.object({
    sessionId: z.string().uuid(),
    requestedNewStart: z.string().datetime(),
  }),
});
