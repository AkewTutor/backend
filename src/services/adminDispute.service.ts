import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import * as refundService from './refund.service.js';
import * as adminPeopleService from './adminPeople.service.js';
import { dispatchNotification } from './notification.service.js';
import * as auditLogService from './auditLog.service.js';

export async function listDisputeQueue(
  status?: string,
  category?: string,
  page: number = 1,
  limit: number = 20,
) {
  const where: any = {};
  if (status) where.status = status;
  if (category) where.category = category;

  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.complaintReport.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { reporter: { select: { role: true } } },
    }),
    prisma.complaintReport.count({ where }),
  ]);

  // 06-api/08 GET /admin/disputes: a slim queue row, never the full description.
  const complaints = rows.map((c) => ({
    id: c.id,
    reporterRole: c.reporter?.role,
    category: c.category,
    status: c.status,
    relatedSessionId: c.relatedSessionId,
    createdAt: c.createdAt,
  }));

  return { complaints, page, limit, total };
}

// The student's current paid billing cycle. Shared by the detail preview and the resolve
// path so both always look at the same payment (latest billing period first).
async function findCurrentPaidPayment(cohortMembershipId: string) {
  return prisma.payment.findFirst({
    where: { cohortMembershipId, status: 'SUCCESS' },
    orderBy: { billingPeriodStart: 'desc' },
  });
}

// Candidate memberships for the REFUND_ISSUED picker (H4 fix). The preview amount comes
// from the same calculateProration the resolve path uses. It is read-only: nothing is
// created or approved here.
async function listCandidateMemberships(cohortId: string) {
  const memberships = await prisma.cohortMembership.findMany({
    where: { cohortId, status: 'ACTIVE' },
    include: { student: { select: { user: { select: { name: true } } } } },
  });

  return Promise.all(
    memberships.map(async (m) => {
      const payment = await findCurrentPaidPayment(m.id);

      let refundPreviewAmount: string | null = null;
      if (payment) {
        const proration = await refundService.calculateProration(
          payment.id,
          'ADMIN_DISPUTE_RESOLUTION',
        );
        // Mirrors resolveDispute: nothing undelivered means nothing to refund.
        if (proration.sessionsRemaining > 0 && Number(proration.amount) > 0) {
          refundPreviewAmount = proration.amount;
        }
      }

      return {
        id: m.id,
        studentDisplayName: m.student?.user?.name ?? 'Student',
        hasActivePaidCycle: payment !== null && payment !== undefined,
        refundPreviewAmount,
      };
    }),
  );
}

export async function getDisputeForReview(complaintId: string) {
  const complaint = await prisma.complaintReport.findUnique({
    where: { id: complaintId },
    include: {
      reporter: { select: { role: true } },
      session: { select: { cohortId: true } },
    },
  });

  if (!complaint) throw new ApiError(404, 'Complaint not found');

  const { reporter, session, ...fields } = complaint;

  // Same cohort resolution order as the complaint's own links: cohort, then session, then thread.
  let cohortId: string | null = complaint.relatedCohortId ?? session?.cohortId ?? null;
  if (!cohortId && complaint.relatedThreadId) {
    const thread = await prisma.messageThread.findUnique({
      where: { id: complaint.relatedThreadId },
      select: { cohortId: true },
    });
    cohortId = thread?.cohortId ?? null;
  }

  const candidateMemberships = cohortId ? await listCandidateMemberships(cohortId) : [];

  return { ...fields, reporterRole: reporter?.role, candidateMemberships };
}

export async function resolveDispute(
  complaintId: string,
  adminId: string,
  data: {
    status: 'RESOLVED' | 'DISMISSED' | 'UNDER_REVIEW';
    resolutionAction?: 'NO_ACTION' | 'WARNING_ISSUED' | 'REFUND_ISSUED' | 'TUTOR_SUSPENDED';
    resolutionNotes: string;
    affectedCohortMembershipId?: string;
  },
) {
  if (data.status === 'RESOLVED' && !data.resolutionAction) {
    throw new ApiError(400, 'A resolution action is required to resolve a complaint');
  }

  const complaint = await prisma.complaintReport.findUnique({
    where: { id: complaintId },
    include: { cohort: true, session: { include: { cohort: true } } },
  });

  if (!complaint) throw new ApiError(404, 'Complaint not found');
  if (complaint.status === 'RESOLVED' || complaint.status === 'DISMISSED') {
    throw new ApiError(409, 'This complaint has already been closed');
  }

  if (data.resolutionAction === 'REFUND_ISSUED') {
    const payment = await findCurrentPaidPayment(data.affectedCohortMembershipId as string);
    if (!payment) {
      throw new ApiError(
        400,
        'affectedCohortMembershipId does not have an active, paid billing cycle to prorate',
      );
    }

    // Check first, so a non-qualifying case fails cleanly instead of leaving an
    // orphan PENDING refund behind when approval is rejected.
    const proration = await refundService.calculateProration(
      payment.id,
      'ADMIN_DISPUTE_RESOLUTION',
    );
    if (proration.sessionsRemaining <= 0 || Number(proration.amount) <= 0) {
      throw new ApiError(
        400,
        'No undelivered sessions in the current billing cycle, so there is nothing to refund',
      );
    }

    const refund = await refundService.createPendingRefund(payment.id, 'ADMIN_DISPUTE_RESOLUTION');
    await refundService.approveRefund(refund.id, adminId);
  } else if (data.resolutionAction === 'TUTOR_SUSPENDED') {
    // Resolve the tutor from the complaint's own links only. Never guess: suspending the
    // wrong account is far worse than refusing the action.
    const tutorProfileId = complaint.cohort?.tutorId ?? complaint.session?.cohort?.tutorId;
    if (!tutorProfileId) {
      throw new ApiError(
        400,
        'Cannot suspend a tutor: this complaint is not linked to a cohort or session with an identifiable tutor',
      );
    }

    // Cohort.tutorId is a TutorProfile id; suspendAccount works on the User id.
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { id: tutorProfileId },
      select: { userId: true },
    });
    if (!tutorProfile) throw new ApiError(404, 'Tutor not found');

    await adminPeopleService.suspendAccount(
      tutorProfile.userId,
      adminId,
      `Suspended due to complaint resolution (complaint ${complaintId})`,
      'SUSPENDED',
    );
  }

  const updated = await prisma.complaintReport.update({
    where: { id: complaintId },
    data: {
      status: data.status,
      resolutionAction: data.resolutionAction,
      resolutionNotes: data.resolutionNotes,
      resolvedById: adminId,
      resolvedAt: new Date(),
    },
  });

  await auditLogService.record({
    actor: adminId,
    action: 'DISPUTE_RESOLVED',
    target: complaintId,
    timestamp: new Date(),
  });

  if (data.status === 'DISMISSED' || data.status === 'RESOLVED') {
    await dispatchNotification(complaint.reporterId, 'COMPLAINT_RESOLVED', {
      complaintId,
      status: data.status,
      resolutionAction: data.resolutionAction,
    });
  }

  return updated;
}
