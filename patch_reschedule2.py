with open('src/services/reschedule.service.ts', 'r') as f:
    content = f.read()

content = content.replace(
    '  const now = new Date();',
    '  const actualTutorId = (session as any).cohort?.tutorId || (session as any).tutorId;\n  const now = new Date();'
)

content = content.replace(
    'const actualTutorId = (session as any).cohort?.tutorId || (session as any).tutorId;\n    if (callerId === actualTutorId) {',
    'if (callerId === actualTutorId) {'
)

with open('src/services/reschedule.service.ts', 'w') as f:
    f.write(content)

