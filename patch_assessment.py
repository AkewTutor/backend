with open('src/services/weeklyAssessment.service.ts', 'r') as f:
    content = f.read()

content = content.replace(
    """  return prisma.weeklyAssessment.create({
    data: {
      cohortMembershipId,
      weekStartDate,
      tutorFeedback,
      scoreSummary
    }
  });""",
    """  return prisma.weeklyAssessment.create({
    data: {
      cohortMembershipId,
      weekStartDate,
      tutorFeedback,
      scoreSummary,
      submittedByTutorId: tutorId
    }
  });"""
)

content = content.replace(
    "{ student: { parentRelationships: { some: { parentId: callerId, status: 'ACTIVE' } } } }",
    "{ student: { guardianRelationships: { some: { parentId: callerId, status: 'ACTIVE' } } } }"
)

with open('src/services/weeklyAssessment.service.ts', 'w') as f:
    f.write(content)
