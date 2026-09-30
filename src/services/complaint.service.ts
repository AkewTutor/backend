import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { dispatchNotification } from './notification.service.js';

export async function createComplaint(
  reporterId: string,
  reporterRole: 'STUDENT' | 'TUTOR' | 'ADMIN',
  data: {
    category: 'SESSION_ISSUE' | 'TUTOR_CONDUCT' | 'PAYMENT_ISSUE' | 'MESSAGE_ISSUE' | 'OTHER';
    description: string;
    relatedCohortId?: string;
    relatedSessionId?: string;
    relatedPaymentId?: string;
  },
) {
  let relatedThreadId: string | null = null;

  if (data.relatedSessionId) {
    const session = await prisma.scheduledSession.findUnique({
      where: { id: data.relatedSessionId },
      include: {
        cohort: { include: { memberships: { include: { student: true } }, tutor: true } },
      },
    });
    if (!session) throw new ApiError(404, 'Session not found');

    const isMember = session.cohort.memberships.some(
      (m) => m.studentId === reporterId || (m as any).student?.userId === reporterId,
    );
    const isTutor =
      session.cohort.tutorId === reporterId || (session.cohort as any).tutor?.userId === reporterId;
    if (!isMember && !isTutor && reporterRole !== 'ADMIN') {
      throw new ApiError(
        403,
        'You can only file a complaint about your own sessions, payments, or cohorts',
      );
    }

    const thread = await prisma.messageThread.findFirst({
      where: { cohortId: session.cohortId },
    });
    if (thread) relatedThreadId = thread.id;
  } else if (data.relatedCohortId) {
    const cohort = await prisma.cohort.findUnique({
      where: { id: data.relatedCohortId },
      include: { memberships: { include: { student: true } }, tutor: true },
    });
    if (!cohort) throw new ApiError(404, 'Cohort not found');

    const isMember = cohort.memberships.some(
      (m) => m.studentId === reporterId || (m as any).student?.userId === reporterId,
    );
    const isTutor = cohort.tutorId === reporterId || (cohort as any).tutor?.userId === reporterId;
    if (!isMember && !isTutor && reporterRole !== 'ADMIN') {
      throw new ApiError(
        403,
        'You can only file a complaint about your own sessions, payments, or cohorts',
      );
    }

    const thread = await prisma.messageThread.findFirst({
      where: { cohortId: cohort.id },
    });
    if (thread) relatedThreadId = thread.id;
  } else if (data.relatedPaymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: data.relatedPaymentId },
      include: { cohortMembership: { include: { student: true } } },
    });
    if (!payment) throw new ApiError(404, 'Payment not found');

    const ownsPayment =
      payment.cohortMembership.studentId === reporterId ||
      (payment.cohortMembership as any).student?.userId === reporterId;
    if (!ownsPayment && reporterRole !== 'ADMIN') {
      throw new ApiError(
        403,
        'You can only file a complaint about your own sessions, payments, or cohorts',
      );
    }
  }

  const complaint = await prisma.complaintReport.create({
    data: {
      reporterId,
      category: data.category,
      description: data.description,
      relatedCohortId: data.relatedCohortId,
      relatedSessionId: data.relatedSessionId,
      relatedPaymentId: data.relatedPaymentId,
      relatedThreadId,
    },
  });

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (admin) {
    await dispatchNotification(admin.id, 'ADMIN_REVIEW_REQUIRED', { complaintId: complaint.id });
  }

  return complaint;
}

export async function listForUser(
  userId: string,
  status?: string,
  page: number = 1,
  limit: number = 20,
) {
  const where: any = { reporterId: userId };
  if (status) where.status = status;

  const skip = (page - 1) * limit;

  const [complaints, total] = await Promise.all([
    prisma.complaintReport.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.complaintReport.count({ where }),
  ]);

  return { complaints, page, limit, total };
}

export async function getForReporter(reporterId: string, complaintId: string) {
  const complaint = await prisma.complaintReport.findUnique({
    where: { id: complaintId },
  });

  if (!complaint) throw new ApiError(404, 'Complaint not found');
  if (complaint.reporterId !== reporterId) {
    throw new ApiError(403, 'Not authorized to view this complaint');
  }

  const { resolutionNotes, resolvedById, ...safeComplaint } = complaint;
  return safeComplaint as any; // any to bypass StrictOmit TS typing in returns, safe enough.
}

export async function getSupportContactInfo() {
  return {
    phone: '+251 123 456 789',
    telegramHandle: '@AkewTutorSupport',
    hours: 'Mon-Fri 9AM-5PM EAT',
  };
}
