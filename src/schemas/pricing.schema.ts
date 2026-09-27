import { z } from 'zod';
import { TutoringFormat } from '@prisma/client';

export const updatePricingConfigSchema = z
  .object({
    params: z.object({
      format: z.nativeEnum(TutoringFormat),
    }),
    body: z.object({
      pricePerStudentPerHour: z.string(),
      totalPerHour: z.string(),
      platformSharePerHour: z.string(),
      tutorSharePerHour: z.string(),
    }),
  })
  .refine(
    (data) => {
      const platform = parseFloat(data.body.platformSharePerHour);
      const tutor = parseFloat(data.body.tutorSharePerHour);
      const total = parseFloat(data.body.totalPerHour);
      // Use an epsilon for floating point precision issues just in case, though for integer-like strings it's exact.
      return Math.abs(platform + tutor - total) < 0.001;
    },
    {
      message: 'platformSharePerHour and tutorSharePerHour must sum up to totalPerHour',
      path: ['body', 'totalPerHour'],
    },
  );
