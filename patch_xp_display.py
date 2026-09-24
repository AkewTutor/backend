with open('src/services/xp.service.ts', 'r') as f:
    content = f.read()

import re

new_logic = """
    let displayName = 'Unknown';
    
    function formatName(name: string | null | undefined): string {
      if (!name) return 'Student';
      const parts = name.trim().split(' ');
      if (parts.length > 1) {
        return `${parts[0]} ${parts[parts.length - 1][0]}.`;
      }
      return parts[0];
    }

    if (entry.studentId === targetStudentId) {
      displayName = formatName(student.user?.name);
    } else {
      const other = await prisma.studentProfile.findUnique({ where: { id: entry.studentId }, include: { user: true }});
      if (other) {
        displayName = formatName(other.user?.name);
      }
    }
"""

content = re.sub(
    r"let displayName = 'Unknown';\s+if \(entry\.studentId === targetStudentId\) \{.*?\s+displayName = other\.user\?\.name \|\| 'Student';\s+\}\s+\}",
    new_logic.strip(),
    content,
    flags=re.DOTALL
)

with open('src/services/xp.service.ts', 'w') as f:
    f.write(content)
