import { prisma } from '../config/db.js';
import { Prisma } from '@prisma/client';
import ApiError from '../utils/ApiError.js';

export async function createPromotion(data: any, adminId: string) {
  if (new Date(data.validTo) <= new Date(data.validFrom)) {
    throw new ApiError(400, 'End date must be after start date');
  }

  const existing = await prisma.promotionCode.findUnique({
    where: { code: data.code },
  });

  if (existing) {
    throw new ApiError(409, 'A promotion with this code already exists');
  }

  return prisma.promotionCode.create({
    data: {
      ...data,
      createdById: adminId,
    },
  });
}

export async function listActivePromotions() {
  const now = new Date();
  return prisma.promotionCode.findMany({
    where: {
      isActive: true,
      validFrom: { lte: now },
      validTo: { gte: now },
    },
  });
}

export async function applyToPayment(code: string, originalAmount: string) {
  const now = new Date();
  const promo = await prisma.promotionCode.findUnique({
    where: { code },
  });

  if (!promo || !promo.isActive || promo.validFrom > now || promo.validTo < now) {
    throw new ApiError(400, 'Invalid or expired promotion code');
  }

  const base = new Prisma.Decimal(originalAmount);
  let discountedAmount = base;

  if (promo.discountType === 'PERCENT') {
    const discountFactor = new Prisma.Decimal(promo.discountValue).dividedBy(100);
    discountedAmount = base.minus(base.times(discountFactor));
  } else if (promo.discountType === 'FIXED_ETB') {
    discountedAmount = base.minus(new Prisma.Decimal(promo.discountValue));
  }

  if (discountedAmount.isNegative()) {
    discountedAmount = new Prisma.Decimal(0);
  }

  return {
    promotionId: promo.id,
    discountedAmount: discountedAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
  };
}

export async function updatePromotion(id: string, data: any) {
  const promo = await prisma.promotionCode.findUnique({ where: { id } });
  if (!promo) throw new ApiError(404, 'Promotion not found');

  return prisma.promotionCode.update({
    where: { id },
    data,
  });
}
