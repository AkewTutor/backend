import { z } from 'zod';

export const rejectRefundSchema = z.object({
  params: z.object({
    refundId: z.string().uuid(),
  }),
  body: z.object({
    rejectionReason: z.string().trim().min(1).max(500),
  }),
});
