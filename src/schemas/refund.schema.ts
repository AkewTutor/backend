import { z } from 'zod';

export const rejectRefundSchema = z.object({
  params: z.object({
    refundId: z.string().uuid(),
  }),
  body: z.object({
    rejectionReason: z.string().min(1),
  }),
});
