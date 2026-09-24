with open('src/services/xp.service.ts', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'let displayName' in line:
        start_idx = i
    if 'rankings.push({' in line:
        end_idx = i
        break

replacement = """
    let displayName = 'Unknown';
    if (entry.studentId === targetStudentId) {
      displayName = student.user?.name || 'Student';
    } else {
      const other = await prisma.studentProfile.findUnique({ where: { id: entry.studentId }, include: { user: true }});
      if (other) {
        displayName = other.user?.name || 'Student';
      }
    }
"""

lines = lines[:start_idx] + [replacement] + lines[end_idx:]

with open('src/services/xp.service.ts', 'w') as f:
    f.writelines(lines)
