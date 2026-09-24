with open('src/services/sessionMiss.service.ts', 'r') as f:
    content = f.read()

content = content.replace("session: { tutorId: filters.tutorId }", "session: { cohort: { tutorId: filters.tutorId } }")
content = content.replace("session: { tutorId },", "session: { cohort: { tutorId } },")

with open('src/services/sessionMiss.service.ts', 'w') as f:
    f.write(content)
