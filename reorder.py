import re

with open('prisma/schema.prisma', 'r') as f:
    content = f.read()

# Base
base_end = content.find('// ---- PHASE 3: MATCHING & COHORTS ----')
base_part = content[:base_end]

# Phase 3
phase3_start = base_end
phase5_start = content.find('enum ThreadStatus {')
phase3_part = content[phase3_start:phase5_start]

# Phase 5
phase6_start = content.find('// ---- PHASE 6: GAMIFICATION & ENGAGEMENT ----')
phase5_part = "// ---- PHASE 5: MESSAGING ----\n\n" + content[phase5_start:phase6_start]

# Phase 6
phase4_start = content.find('// ---- PHASE 4: CLASS DELIVERY & LIBRARY ----')
phase6_part = content[phase6_start:phase4_start]

# Phase 4
phase4_part = content[phase4_start:]

new_content = base_part + phase3_part + phase4_part + phase5_part + phase6_part

with open('prisma/schema.prisma', 'w') as f:
    f.write(new_content)
