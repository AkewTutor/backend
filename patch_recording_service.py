import re

with open('src/services/recording.service.ts', 'r') as f:
    content = f.read()

# 1. Fix uploadRecording IDOR and encoding/fileSize
old_upload = """export async function uploadRecording(tutorId: string, sessionId: string, buffer: Buffer) {
  const session = await prisma.scheduledSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new ApiError(404, 'Session not found');"""
new_upload = """export async function uploadRecording(tutorId: string, sessionId: string, buffer: Buffer) {
  const session = await prisma.scheduledSession.findUnique({ where: { id: sessionId }, include: { cohort: true } });
  if (!session) throw new ApiError(404, 'Session not found');
  
  if ((session.cohort && session.cohort.tutorId !== tutorId) && (session as any).tutorId !== tutorId) {
    throw new ApiError(403, 'Not authorized to upload a recording for this session');
  }"""
content = content.replace(old_upload, new_upload)

old_create = """  return prisma.recording.create({
    data: {
      sessionId,
      storageKey: uploadResult.storageKey,
      expiresAt,
      keepPermanently: false,
    },
  });"""
new_create = """  return prisma.recording.create({
    data: {
      sessionId,
      storageKey: uploadResult.storageKey,
      expiresAt,
      keepPermanently: false,
      encoding: '720p',
      fileSizeBytes: buffer.length,
    },
  });"""
content = content.replace(old_create, new_create)

# 3. Fix soft deletion in getSignedUrl
old_getSignedUrl = """  if (!recording) throw new ApiError(404, 'Recording not found');

  if (!recording.keepPermanently && recording.expiresAt < new Date()) {
    throw new ApiError(404, 'Recording no longer available');
  }"""
new_getSignedUrl = """  if (!recording) throw new ApiError(404, 'Recording not found');

  if (recording.deletedAt || (!recording.keepPermanently && recording.expiresAt < new Date())) {
    throw new ApiError(404, 'Recording no longer available');
  }"""
content = content.replace(old_getSignedUrl, new_getSignedUrl)

with open('src/services/recording.service.ts', 'w') as f:
    f.write(content)
