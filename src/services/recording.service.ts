import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { getConsentStatus } from './recordingConsent.service.js';
import { upload, getSignedUrl as storageGetSignedUrl } from '../utils/providers/storage.client.js';

export async function uploadRecording(tutorId: string, sessionId: string, buffer: Buffer) {
  const session = await prisma.scheduledSession.findUnique({
    where: { id: sessionId },
    include: { cohort: true },
  });
  if (!session) throw new ApiError(404, 'Session not found');

  const actualTutorId = session.cohort?.tutorId || (session as any).tutorId;
  if (actualTutorId !== tutorId) {
    throw new ApiError(403, 'Not authorized to upload a recording for this session');
  }

  const memberships = await prisma.cohortMembership.findMany({
    where: { cohortId: session.cohortId, status: 'ACTIVE' },
  });

  for (const member of memberships) {
    const status = await getConsentStatus(tutorId, member.studentId);
    if (!status.consentComplete) {
      throw new ApiError(
        409,
        'Recording consent must be acknowledged by both parties for every active student before this session can be recorded',
      );
    }
  }

  const key = `recordings/2026/09/${sessionId}.mp4`;
  const uploadResult = await upload(key, buffer, 'video/mp4');

  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  return prisma.recording.create({
    data: {
      sessionId,
      storageKey: uploadResult.storageKey,
      expiresAt,
      keepPermanently: false,
      encoding: '720p',
      fileSizeBytes: buffer.length,
    },
  });
}

export async function getSignedUrl(callerId: string, recordingId: string) {
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    include: { session: true },
  });
  if (!recording) throw new ApiError(404, 'Recording not found');

  if (recording.deletedAt || (!recording.keepPermanently && recording.expiresAt < new Date())) {
    throw new ApiError(404, 'Recording no longer available');
  }

  const membership = await prisma.cohortMembership.findFirst({
    where: {
      cohortId: recording.session.cohortId,
      OR: [{ studentId: callerId }, { cohort: { tutorId: callerId } }],
    },
  });

  if (!membership) {
    throw new ApiError(403, 'Not authorized to access this recording');
  }

  const signedUrl = await storageGetSignedUrl(recording.storageKey, 900);
  return { signedUrl, expiresIn: 900 };
}

export async function keepPermanently(callerId: string, recordingId: string) {
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    include: { session: true },
  });
  if (!recording) throw new ApiError(404, 'Recording not found');

  const membership = await prisma.cohortMembership.findFirst({
    where: {
      cohortId: recording.session.cohortId,
      OR: [{ studentId: callerId }, { cohort: { tutorId: callerId } }],
    },
  });

  if (!membership) {
    throw new ApiError(403, 'Not authorized to modify this recording');
  }

  return prisma.recording.update({
    where: { id: recordingId },
    data: { keepPermanently: true },
  });
}

export async function flagMissing(sessionId: string) {
  const session = await prisma.scheduledSession.findUnique({
    where: { id: sessionId },
    include: { recording: true },
  });
  if (!session) return;
  if (session.recording) return;

  if (session.scheduledEnd.getTime() < Date.now() - 2 * 60 * 60 * 1000) {
    await prisma.scheduledSession.update({
      where: { id: sessionId },
      data: { recordingStatus: 'MISSING' },
    });
  }
}

export async function escalateMissing(sessionId: string) {
  const session = await prisma.scheduledSession.findUnique({
    where: { id: sessionId },
    include: { recording: true },
  });
  if (!session) return;
  if (session.recording) return;

  if (
    session.recordingStatus === 'MISSING' &&
    session.scheduledEnd.getTime() < Date.now() - 24 * 60 * 60 * 1000
  ) {
    await prisma.scheduledSession.update({
      where: { id: sessionId },
      data: { recordingStatus: 'ESCALATED' },
    });
  }
}

export async function getMyRecordings(callerId: string, options: any) {
  const recordings = await prisma.recording.findMany({
    where: {
      OR: [{ keepPermanently: true }, { expiresAt: { gte: new Date() } }],
      deletedAt: null,
      session: {
        cohort: {
          OR: [{ memberships: { some: { studentId: callerId } } }, { tutorId: callerId }],
        },
      },
    },
  });
  return { recordings, page: 1, limit: 20, total: recordings.length };
}
