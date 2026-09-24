import { prisma } from '../config/db.js';

export async function getConsentStatus(tutorId: string, studentId: string) {
  const consent = await prisma.recordingConsent.findFirst({
    where: { tutorId, studentId },
  });

  if (!consent) {
    return {
      tutorId,
      studentId,
      tutorAcknowledgedAt: null,
      studentOrParentAcknowledgedAt: null,
      consentComplete: false,
    };
  }

  const consentComplete = !!(consent.tutorAcknowledgedAt && consent.studentOrParentAcknowledgedAt);

  return {
    tutorId,
    studentId,
    tutorAcknowledgedAt: consent.tutorAcknowledgedAt,
    studentOrParentAcknowledgedAt: consent.studentOrParentAcknowledgedAt,
    consentComplete,
  };
}

export async function acknowledgeAsStudentOrParent(
  callerId: string,
  tutorId: string,
  studentId: string,
) {
  const now = new Date();

  const updated = await prisma.recordingConsent.upsert({
    where: {
      tutorId_studentId: { tutorId, studentId },
    },
    update: {
      studentOrParentAcknowledgedAt: now,
      acknowledgedByUserId: callerId,
    },
    create: {
      tutorId,
      studentId,
      studentOrParentAcknowledgedAt: now,
      acknowledgedByUserId: callerId,
    },
  });

  return {
    tutorId: updated.tutorId,
    studentId: updated.studentId,
    tutorAcknowledgedAt: updated.tutorAcknowledgedAt,
    studentOrParentAcknowledgedAt: updated.studentOrParentAcknowledgedAt,
    consentComplete: !!(updated.tutorAcknowledgedAt && updated.studentOrParentAcknowledgedAt),
  };
}

export async function acknowledgeAsTutor(callerId: string, tutorId: string, studentId: string) {
  const now = new Date();

  const updated = await prisma.recordingConsent.upsert({
    where: {
      tutorId_studentId: { tutorId, studentId },
    },
    update: {
      tutorAcknowledgedAt: now,
    },
    create: {
      tutorId,
      studentId,
      tutorAcknowledgedAt: now,
    },
  });

  return {
    tutorId: updated.tutorId,
    studentId: updated.studentId,
    tutorAcknowledgedAt: updated.tutorAcknowledgedAt,
    studentOrParentAcknowledgedAt: updated.studentOrParentAcknowledgedAt,
    consentComplete: !!(updated.tutorAcknowledgedAt && updated.studentOrParentAcknowledgedAt),
  };
}
