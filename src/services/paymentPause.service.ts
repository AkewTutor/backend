import { prisma } from '../config/db.js';

export async function pauseForNonPayment(membershipId: string) {
  return prisma.paymentPause.create({
    data: {
      cohortMembershipId: membershipId,
      reason: 'NONPAYMENT',
      startedAt: new Date(),
    },
  });
}

export async function resumeOnPayment(membershipId: string) {
  const activePause = await prisma.paymentPause.findFirst({
    where: { cohortMembershipId: membershipId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });

  if (!activePause) return;

  await prisma.paymentPause.update({
    where: { id: activePause.id },
    data: { endedAt: new Date() },
  });

  await rescheduleSessionsDuringPause(membershipId);
}

export async function rescheduleSessionsDuringPause(membershipId: string) {
  const pause = await prisma.paymentPause.findFirst({
    where: { cohortMembershipId: membershipId },
    orderBy: { endedAt: 'desc' },
  });

  if (!pause || !pause.endedAt) {
    return { rescheduled: [] };
  }

  const sessions = await prisma.scheduledSession.findMany({
    where: {
      cohort: {
        memberships: { some: { id: membershipId } },
      },
      scheduledStart: {
        gte: pause.startedAt,
        lte: pause.endedAt,
      },
    },
  });

  const rescheduled = [];
  for (const session of sessions) {
    await prisma.scheduledSession.update({
      where: { id: session.id },
      data: { status: 'PAYMENT_PAUSE_RESCHEDULED' },
    });
    rescheduled.push(session.id);
  }

  return { rescheduled };
}
