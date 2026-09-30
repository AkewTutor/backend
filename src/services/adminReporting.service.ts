import { prisma } from '../config/db.js';

export async function aggregatePlatformHealth() {
  const [
    openDisputes,
    overdueMatchApprovals,
    recordingComplianceEscalations,
    pendingPayoutBatches,
  ] = await Promise.all([
    prisma.complaintReport.count({ where: { status: 'OPEN' } }),
    prisma.cohort.count({ where: { adminOverdueNotifiedAt: { not: null } } }),
    prisma.scheduledSession.count({ where: { recordingStatus: 'ESCALATED' } }),
    prisma.payout.count({ where: { status: 'PENDING' } }),
  ]);

  return {
    openDisputes,
    overdueMatchApprovals,
    recordingComplianceEscalations,
    pendingPayoutBatches,
    generatedAt: new Date(),
  };
}

export async function getActivityHistory(
  page: number | string = 1,
  limit: number | string = 20,
  dateRange: string = '30d',
) {
  const days = parseInt(dateRange.replace('d', ''));
  const since = new Date();
  since.setDate(since.getDate() - days);

  const parsedPage = typeof page === 'string' ? parseInt(page) : page;
  const parsedLimit = typeof limit === 'string' ? parseInt(limit) : limit;
  const skip = (parsedPage - 1) * parsedLimit;

  const [cohorts, payments, complaints, tutorProfiles, refunds, payouts] = await Promise.all([
    prisma.cohort.findMany({ where: { createdAt: { gte: since } }, skip, take: parsedLimit }),
    prisma.payment.findMany({ where: { createdAt: { gte: since } }, skip, take: parsedLimit }),
    prisma.complaintReport.findMany({
      where: { createdAt: { gte: since } },
      skip,
      take: parsedLimit,
    }),
    prisma.tutorProfile.findMany({
      where: { verifiedAt: { gte: since } },
      skip,
      take: parsedLimit,
    }),
    prisma.refund.findMany({ where: { createdAt: { gte: since } }, skip, take: parsedLimit }),
    prisma.payout.findMany({ where: { createdAt: { gte: since } }, skip, take: parsedLimit }),
  ]);

  const events: any[] = [];
  cohorts.forEach((c) => events.push({ eventType: 'BOOKING', date: c.createdAt, data: c }));
  payments.forEach((c) => events.push({ eventType: 'PAYMENT', date: c.createdAt, data: c }));
  complaints.forEach((c) => events.push({ eventType: 'DISPUTE', date: c.createdAt, data: c }));
  tutorProfiles.forEach((c) =>
    events.push({ eventType: 'TUTOR_VERIFICATION', date: c.verifiedAt, data: c }),
  );
  refunds.forEach((c) => events.push({ eventType: 'REFUND', date: c.createdAt, data: c }));
  payouts.forEach((c) => events.push({ eventType: 'PAYOUT', date: c.createdAt, data: c }));

  events.sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    events: events.slice(0, parsedLimit),
    page: parsedPage,
    limit: parsedLimit,
    total: events.length,
  };
}

export async function getTutorPerformanceHistory(
  tutorId?: string,
  page: number | string = 1,
  limit: number | string = 20,
  sortField?: string,
  verificationStatus: string = 'VERIFIED',
) {
  const parsedPage = typeof page === 'string' ? parseInt(page) : page;
  const parsedLimit = typeof limit === 'string' ? parseInt(limit) : limit;
  const skip = (parsedPage - 1) * parsedLimit;

  const where: any = {};
  if (tutorId) where.id = tutorId;
  else where.verificationStatus = verificationStatus;

  const orderBy = sortField ? { [sortField]: 'desc' } : undefined;

  const profiles = await prisma.tutorProfile.findMany({
    where,
    skip,
    take: parsedLimit,
    orderBy,
  });

  const tutors = await Promise.all(
    profiles.map(async (p) => {
      const completedSessionCount = await prisma.scheduledSession.count({
        where: { cohort: { tutorId: p.id }, status: 'COMPLETED' },
      });
      const tutorCausedMissCount = await prisma.sessionMiss.count({
        where: { session: { cohort: { tutorId: p.id } } },
      });
      const uniqueStudentsTaught = (
        await prisma.cohortMembership.groupBy({
          by: ['studentId'],
          where: { cohort: { tutorId: p.id } },
        })
      ).length;
      const badgeCount = await prisma.tutorBadge.count({
        where: { tutorId: p.id },
      });
      const complaintCount = await prisma.complaintReport.count({
        where: { cohort: { tutorId: p.id } },
      });

      return {
        tutorId: p.id,
        verificationStatus: p.verificationStatus,
        uniqueStudentsTaught,
        completedSessionCount,
        tutorCausedMissCount,
        badgeCount,
        complaintCount,
      };
    }),
  );

  return { tutors, page: parsedPage, limit: parsedLimit };
}
