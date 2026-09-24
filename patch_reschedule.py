with open('src/services/reschedule.service.ts', 'r') as f:
    content = f.read()

content = content.replace(
    'const session = await prisma.scheduledSession.findUnique({ where: { id: sessionId } });',
    'const session = await prisma.scheduledSession.findUnique({ where: { id: sessionId }, include: { cohort: true } });'
)

content = content.replace(
    'if (callerId === session.tutorId) {',
    'const actualTutorId = (session as any).cohort?.tutorId || (session as any).tutorId;\n    if (callerId === actualTutorId) {'
)

content = content.replace(
    'await recordTutorCausedMiss(sessionId);',
    "await recordTutorCausedMiss(sessionId, 'LATE_CANCELLATION');"
)

content = content.replace(
    'await recordStudentCausedMiss(sessionId);',
    "await recordStudentCausedMiss(sessionId, 'LATE_CANCELLATION');"
)

content = content.replace(
    'where: { tutorId: session.tutorId, isRecurring: true }',
    'where: { tutorId: actualTutorId, isRecurring: true }'
)

with open('src/services/reschedule.service.ts', 'w') as f:
    f.write(content)

