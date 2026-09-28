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

  // Serialize concurrent activations per format: the advisory lock is held until the
  // transaction ends, so a second admin waits, then deactivates the first admin's row.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pricing:' + format}))`;

    await tx.pricingConfig.updateMany({
      where: { format: format as TutoringFormat, isActive: true },
      data: { isActive: false },
    });

    return tx.pricingConfig.create({
      data: {
        format: format as TutoringFormat,
        pricePerStudentPerHour: payload.pricePerStudentPerHour,
        totalPerHour: payload.totalPerHour,
        platformSharePerHour: payload.platformSharePerHour,
        tutorSharePerHour: payload.tutorSharePerHour,
        isActive: true,
        createdById: adminId,
      },
    });
  });
}
