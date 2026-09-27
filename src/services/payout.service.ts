import { prisma } from '../config/db.js';
import { Prisma } from '@prisma/client';
import ApiError from '../utils/ApiError.js';

export async function generateMonthlyPayouts(periodStart: string, periodEnd: string) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  const earnings = await prisma.tutorEarning.findMany({
    where: {
      payoutId: null,
      createdAt: { gte: start, lte: end },
    },
  });

  const byTutor: Record<string, typeof earnings> = {};
  for (const e of earnings) {
    if (!byTutor[e.tutorId]) byTutor[e.tutorId] = [];
    byTutor[e.tutorId].push(e);
  }

  let createdCount = 0;

  for (const tutorId of Object.keys(byTutor)) {
    const tutorEarnings = byTutor[tutorId];
    const total = tutorEarnings.reduce((acc, curr) => acc.plus(curr.amount), new Prisma.Decimal(0));

    await prisma.$transaction(async (tx) => {
      const payout = await tx.payout.create({
        data: {
          tutorId,
          periodStart: start,
          periodEnd: end,
          totalAmount: total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
          status: 'PENDING',
        },
      });
      await tx.tutorEarning.updateMany({
        where: { id: { in: tutorEarnings.map((e) => e.id) } },
        data: { payoutId: payout.id },
      });
    });
    createdCount++;
  }

  return { created: createdCount };
}

export async function markPaid(payoutId: string, adminId: string) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new ApiError(404, 'Payout not found');

  if (payout.status === 'PAID') {
    throw new ApiError(409, 'This payout has already been marked as paid');
  }

  return prisma.payout.update({
    where: { id: payoutId },
    data: {
      status: 'PAID',
      paidAt: new Date(),
    },
  });
}

export async function adminAdjust(
  payoutId: string,
  adminId: string,
  data: { totalAmount: string },
) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new ApiError(404, 'Payout not found');

  if (payout.status === 'PAID') {
    throw new ApiError(409, 'Cannot adjust a payout that is already paid');
  }

  return prisma.payout.update({
    where: { id: payoutId },
    data: {
      totalAmount: data.totalAmount,
    },
  });
}

export async function listPayouts(filters: {
  tutorId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  const where: Prisma.PayoutWhereInput = {};
  if (filters.tutorId) where.tutorId = filters.tutorId;
  if (filters.status) where.status = filters.status as any;

  const [payouts, total] = await Promise.all([
    prisma.payout.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payout.count({ where }),
  ]);

  return { payouts, page, limit, total };
}
