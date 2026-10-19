import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import {
  upload as storageUpload,
  getSignedUrl as storageGetSignedUrl,
} from '../utils/providers/storage.client.js';

const LEGACY_FILE_URL_PREFIX = 'https://r2.akewtutor.com/';

function toStorageKey(fileUrl: string) {
  return fileUrl.startsWith(LEGACY_FILE_URL_PREFIX)
    ? fileUrl.slice(LEGACY_FILE_URL_PREFIX.length)
    : fileUrl;
}

const LEGACY_FILE_URL_PREFIX = 'https://r2.akewtutor.com/';

function toStorageKey(fileUrl: string) {
  return fileUrl.startsWith(LEGACY_FILE_URL_PREFIX)
    ? fileUrl.slice(LEGACY_FILE_URL_PREFIX.length)
    : fileUrl;
}

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
    fileType === 'PDF' ? 'application/pdf' : 'application/octet-stream',
  );

  return prisma.libraryMaterial.create({
    data: {
      cohortId,
      uploadedByTutorId: tutorId,
      title,
      fileType: fileType as any,
      fileUrl: storageKey,
    },
  });
}

/**
 * callerId is the role's profile id (StudentProfile / TutorProfile / ParentProfile);
 * for ADMIN it is the user id and is unused. Admin has read access to any cohort.
 */
export async function listCohortMaterials(callerId: string, cohortId: string, role?: string) {
  if (role !== 'ADMIN') {
    let isMember = false;

    if (role === 'PARENT') {
      const links = await prisma.parentStudentRelationship.findMany({
        where: { parentId: callerId, status: 'ACTIVE' },
        select: { studentId: true },
      });
      const studentIds = links.map((l: { studentId: string }) => l.studentId);
      if (studentIds.length > 0) {
        const membership = await prisma.cohortMembership.findFirst({
          where: { cohortId, studentId: { in: studentIds }, status: 'ACTIVE' },
        });
        isMember = !!membership;
      }
    } else {
      const membership = await prisma.cohortMembership.findFirst({
        where: { cohortId, studentId: callerId, status: 'ACTIVE' },
      });
      isMember = !!membership;
    }

    if (!isMember) {
      const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
      if (cohort?.tutorId !== callerId) {
        throw new ApiError(403, "Not authorized to view this cohort's materials");
      }
    }
  }

  const materials = await prisma.libraryMaterial.findMany({
    where: { cohortId, removedAt: null },
    select: { id: true, title: true, fileType: true, fileUrl: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  // fileUrl holds the storage key (older rows hold the legacy r2.akewtutor.com URL);
  // hand back a short-lived signed download URL instead.
  return Promise.all(
    materials.map(async (m) => ({
      ...m,
      fileUrl: m.fileUrl ? await storageGetSignedUrl(toStorageKey(m.fileUrl), 3600) : m.fileUrl,
    })),
  );
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

function consentKey(tutorId: string, studentId: string) {
  return tutorId + ':' + studentId;
}

export async function adminRecordingCompliance() {
  const sessions = await prisma.scheduledSession.findMany({
    where: {
      OR: [{ recordingStatus: { in: ['MISSING', 'ESCALATED'] } }, { status: 'COMPLETED' }],
    },
    include: {
      cohort: {
        select: {
          tutorId: true,
          tutor: { select: { user: { select: { name: true, email: true } } } },
          memberships: { where: { status: 'ACTIVE' }, select: { studentId: true } },
        },
      },
    },
    orderBy: { scheduledEnd: 'asc' },
  });

  const tutorIds = [
    ...new Set(sessions.map((s) => s.cohort?.tutorId).filter((id): id is string => !!id)),
  ];
  const studentIds = [
    ...new Set(sessions.flatMap((s) => (s.cohort?.memberships ?? []).map((m) => m.studentId))),
  ];
  const consents =
    studentIds.length > 0
      ? await prisma.recordingConsent.findMany({
          where: { tutorId: { in: tutorIds }, studentId: { in: studentIds } },
          select: {
            tutorId: true,
            studentId: true,
            tutorAcknowledgedAt: true,
            studentOrParentAcknowledgedAt: true,
          },
        })
      : [];
  const completeConsents = new Set(
    consents
      .filter((c) => c.tutorAcknowledgedAt && c.studentOrParentAcknowledgedAt)
      .map((c) => consentKey(c.tutorId, c.studentId)),
  );

  return sessions
    .map((row) => {
      const tutorId = row.cohort?.tutorId ?? null;
      const members = row.cohort?.memberships ?? [];
      const consentMissingCount = members.filter(
        (m) => !tutorId || !completeConsents.has(consentKey(tutorId, m.studentId)),
      ).length;
      return {
        sessionId: row.id,
        cohortId: row.cohortId,
        tutorId,
        tutorName: row.cohort?.tutor?.user?.name ?? null,
        tutorEmail: row.cohort?.tutor?.user?.email ?? null,
        scheduledEnd: row.scheduledEnd,
        recordingStatus: row.recordingStatus,
        consentIncomplete: consentMissingCount > 0,
        consentMissingCount,
      };
    })
    .filter(
      (r) =>
        r.recordingStatus === 'MISSING' || r.recordingStatus === 'ESCALATED' || r.consentIncomplete,
    );
}
