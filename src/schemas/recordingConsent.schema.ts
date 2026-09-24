import { z } from 'zod';

export const acknowledgeConsentSchema = z.object({
  body: z.object({
    tutorId: z.string().uuid(),
    studentId: z.string().uuid(),
  }),
});
