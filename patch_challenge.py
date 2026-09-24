import re
with open('tests/services/challenge.service.test.ts', 'r') as f:
    content = f.read()

# Add mock implementation for findUnique in the beforeEach of trackProgress
mock_find = """  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.challenge.findUnique as any).mockResolvedValue({ id: CHALLENGE_ID, targetValue: 3 });
  });"""
content = content.replace("beforeEach(() => vi.clearAllMocks());", mock_find, 1) # wait, it's used multiple times
# Let's just find the describe('trackProgress') and replace its beforeEach
lines = content.split('\n')
for i, line in enumerate(lines):
    if "describe('trackProgress'" in line:
        # the next line is beforeEach
        lines[i+1] = """  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.challenge.findUnique as any).mockResolvedValue({ id: CHALLENGE_ID, targetValue: 3 });
  });"""

with open('tests/services/challenge.service.test.ts', 'w') as f:
    f.write('\n'.join(lines))
