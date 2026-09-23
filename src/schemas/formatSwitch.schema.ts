import { z } from 'zod';

export const requestFormatSwitchSchema = z.object({
  body: z.object({
    toFormat: z.enum(['ONE_TO_ONE', 'ONE_TO_THREE', 'ONE_TO_FIVE']),
    studentId: z.string().uuid().optional(),
  }),
});
