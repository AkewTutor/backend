import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { TutoringFormat } from '@prisma/client';

export async function getActiveConfig() {
  return prisma.pricingConfig.findMany({
    where: { isActive: true },
  });
}

export async function createAndActivateConfig(
  format: TutoringFormat | string,
  payload: {
    pricePerStudentPerHour: string;
    totalPerHour: string;
    platformSharePerHour: string;
    tutorSharePerHour: string;
  },
  adminId: string,
) {
  const platform = parseFloat(payload.platformSharePerHour);
  const tutor = parseFloat(payload.tutorSharePerHour);
  const total = parseFloat(payload.totalPerHour);

  if (Math.abs(platform + tutor - total) > 0.001) {
    throw new ApiError(400, 'Platform and tutor shares must sum to the total per hour');
  }

  const existingActive = await prisma.pricingConfig.findFirst({
    where: { format: format as TutoringFormat, isActive: true },
  });

  const txs = [];
  if (existingActive) {
    txs.push(
      prisma.pricingConfig.update({
        where: { id: existingActive.id },
        data: { isActive: false },
      }),
    );
  }

  txs.push(
    prisma.pricingConfig.create({
      data: {
        format: format as TutoringFormat,
        pricePerStudentPerHour: payload.pricePerStudentPerHour,
        totalPerHour: payload.totalPerHour,
        platformSharePerHour: payload.platformSharePerHour,
        tutorSharePerHour: payload.tutorSharePerHour,
        isActive: true,
        createdById: adminId,
      },
    }),
  );

  const results = await prisma.$transaction(txs);
  return results[results.length - 1]; // Return the newly created config
}
