import { z } from 'zod';

export const createPromotionSchema = z.object({
  body: z
    .object({
      code: z.string().min(1),
      discountType: z.enum(['PERCENT', 'FIXED_ETB']),
      discountValue: z.string(),
      validFrom: z.string().datetime(),
      validTo: z.string().datetime(),
    })
    .refine((data) => new Date(data.validTo) > new Date(data.validFrom), {
      message: 'validTo must be after validFrom',
      path: ['validTo'],
    }),
});
