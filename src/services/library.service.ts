import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { upload as storageUpload } from '../utils/providers/storage.client.js';

export async function uploadMaterial(
  tutorId: string,
  cohortId: string,
  title: string,
  fileType: string,
  fileBuffer: Buffer,
) {
  const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
  if (!cohort || cohort.tutorId !== tutorId) {
    throw new ApiError(403, 'Not authorized to upload to this cohort');
  }

  // Magic byte checks
  if (fileBuffer.length >= 2 && fileBuffer[0] === 0x4d && fileBuffer[1] === 0x5a) {
    throw new ApiError(400, 'Unsupported file type');
  }
  if (
    fileType === 'PDF' &&
    (fileBuffer.length < 4 || fileBuffer.toString('latin1', 0, 4) !== '%PDF')
  ) {
    throw new ApiError(400, 'Unsupported file type');
  }

  const { storageKey } = await storageUpload(
    `library/${cohortId}/${Date.now()}-${fileType}`,
    fileBuffer,
    'application/pdf',
  );

  return prisma.libraryMaterial.create({
    data: {
      cohortId,
      uploadedByTutorId: tutorId,
      title,
      fileType: fileType as any,
      fileUrl: `https://r2.akewtutor.com/${storageKey}`,
    },
  });
}

export async function listCohortMaterials(callerId: string, cohortId: string) {
  const membership = await prisma.cohortMembership.findFirst({
    where: { cohortId, studentId: callerId, status: 'ACTIVE' },
  });

  if (!membership) {
    const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
    if (cohort?.tutorId !== callerId) {
      throw new ApiError(403, "Not authorized to view this cohort's materials");
    }
  }

  return prisma.libraryMaterial.findMany({
    where: { cohortId, removedAt: null },
  });
}

export async function adminManageLibrary(materialId: string, adminId: string, updates: any) {
  if (updates.remove) {
    return prisma.libraryMaterial.update({
      where: { id: materialId },
      data: { removedAt: new Date() },
    });
  }

  return prisma.libraryMaterial.update({
    where: { id: materialId },
    data: { title: updates.title },
  });
}

export async function adminRecordingCompliance() {
  return prisma.scheduledSession.findMany({
    where: {
      recordingStatus: { in: ['MISSING', 'ESCALATED'] },
    },
  });
}
