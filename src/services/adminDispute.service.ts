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

  const complaints = await prisma.complaintReport.findMany({
    where,
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  return { complaints, page, limit };
}

export async function getDisputeForReview(complaintId: string) {
  const complaint = await prisma.complaintReport.findUnique({
    where: { id: complaintId },
  });

  if (!complaint) throw new ApiError(404, 'Complaint not found');

  return complaint;
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
    const payment = await prisma.payment.findFirst({
      where: { cohortMembershipId: data.affectedCohortMembershipId, status: 'SUCCESS' },
    });
    if (!payment) {
      throw new ApiError(
        400,
        'affectedCohortMembershipId does not have an active, paid billing cycle to prorate',
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
