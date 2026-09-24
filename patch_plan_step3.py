with open('/home/adonay/.gemini/antigravity/brain/1ab44746-f2c1-43cd-9bef-c7f6a395b11a/phase-6-plan.md', 'r') as f:
    content = f.read()

content = content.replace('- [ ] Step 3: Streaks & Challenges Module', '- [x] Step 3: Streaks & Challenges Module')

with open('/home/adonay/.gemini/antigravity/brain/1ab44746-f2c1-43cd-9bef-c7f6a395b11a/phase-6-plan.md', 'w') as f:
    f.write(content)
