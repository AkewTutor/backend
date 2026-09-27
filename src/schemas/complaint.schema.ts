import { z } from 'zod';

export const createComplaintSchema = z.object({
  body: z
    .object({
      category: z.enum([
        'SESSION_ISSUE',
        'TUTOR_CONDUCT',
        'PAYMENT_ISSUE',
        'MESSAGE_ISSUE',
        'OTHER',
      ]),
      description: z.string().min(10).max(2000),
      relatedCohortId: z.string().optional(),
      relatedSessionId: z.string().optional(),
      relatedPaymentId: z.string().optional(),
    })
    .refine(
      (data) => {
        if (data.category !== 'OTHER') {
          return data.relatedCohortId || data.relatedSessionId || data.relatedPaymentId;
        }
        return true;
      },
      {
        message:
          'A complaint must reference a session, payment, or cohort unless filed as a general (OTHER) report',
      },
    ),
});

export const resolveDisputeSchema = z.object({
  body: z
    .object({
      status: z.enum(['RESOLVED', 'DISMISSED', 'UNDER_REVIEW']),
      resolutionNotes: z.string().min(1),
      resolutionAction: z
        .enum(['NO_ACTION', 'WARNING_ISSUED', 'REFUND_ISSUED', 'TUTOR_SUSPENDED'])
        .optional(),
      affectedCohortMembershipId: z.string().optional(),
    })
    .strip()
    .refine(
      (data) => {
        if (data.status === 'RESOLVED' && !data.resolutionAction) {
          return false;
        }
        return true;
      },
      {
        message: 'A resolution action is required to resolve a complaint',
        path: ['resolutionAction'],
      },
    )
    .refine(
      (data) => {
        if (data.resolutionAction === 'REFUND_ISSUED' && !data.affectedCohortMembershipId) {
          return false;
        }
        return true;
      },
      {
        message: 'affectedCohortMembershipId is required for this resolution action',
        path: ['affectedCohortMembershipId'],
      },
    ),
});
