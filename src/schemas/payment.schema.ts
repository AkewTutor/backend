import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  body: z
    .object({
      cohortMembershipId: z.string().uuid(),
      promotionCode: z.string().optional(),
    })
    .strict(),
});
