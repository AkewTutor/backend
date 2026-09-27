import { prisma } from '../config/db.js';
import { Prisma, EarningRateType } from '@prisma/client';
import ApiError from '../utils/ApiError.js';

export async function creditEarning(sessionId: string, tutorId: string, rateType: EarningRateType) {
  const existing = await prisma.tutorEarning.findUnique({ where: { sessionId } });
  if (existing) return existing;

  const session = await prisma.scheduledSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) throw new ApiError(404, 'Session not found');

  const config = await prisma.pricingConfig.findFirst({
    where: { isActive: true },
  });
  if (!config) throw new ApiError(500, 'No active pricing config found');

  let amountRaw = new Prisma.Decimal(config.tutorSharePerHour);
  if (rateType === 'REDUCED_MAKEUP') {
    amountRaw = amountRaw.times(0.5);
  }

  const amount = amountRaw.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);

  return prisma.tutorEarning.create({
    data: {
      sessionId,
      tutorId,
      rateType,
      amount,
    },
  });
}

export async function getEarningsForTutor(tutorId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;

  const [earnings, total] = await Promise.all([
    prisma.tutorEarning.findMany({
      where: { tutorId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tutorEarning.count({ where: { tutorId } }),
  ]);

  const unpaidEarnings = await prisma.tutorEarning.findMany({
    where: { tutorId, payoutId: null },
  });

  const upcomingAmount = unpaidEarnings
    .reduce((acc, curr) => {
      return acc.plus(curr.amount);
    }, new Prisma.Decimal(0))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed(2);

  return {
    earnings,
    page,
    limit,
    total,
    upcomingPayout: { amount: upcomingAmount },
  };
}
