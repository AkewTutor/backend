import { z } from 'zod';

export const getActivitySchema = z.object({
  query: z.object({
    dateRange: z.enum(['7d', '30d', '90d', '1y']).optional(),
    eventType: z
      .enum(['BOOKING', 'PAYMENT', 'DISPUTE', 'TUTOR_VERIFICATION', 'REFUND', 'PAYOUT'])
      .optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});
