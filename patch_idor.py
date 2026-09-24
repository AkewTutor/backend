with open('src/services/recording.service.ts', 'r') as f:
    content = f.read()

old_code = """  if ((session.cohort && session.cohort.tutorId !== tutorId) && (session as any).tutorId !== tutorId) {
    throw new ApiError(403, 'Not authorized to upload a recording for this session');
  }"""
new_code = """  const actualTutorId = session.cohort?.tutorId || (session as any).tutorId;
  if (actualTutorId !== tutorId) {
    throw new ApiError(403, 'Not authorized to upload a recording for this session');
  }"""

content = content.replace(old_code, new_code)

with open('src/services/recording.service.ts', 'w') as f:
    f.write(content)
