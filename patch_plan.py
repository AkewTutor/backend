with open('/home/adonay/.gemini/antigravity/brain/1ab44746-f2c1-43cd-9bef-c7f6a395b11a/phase-6-plan.md', 'r') as f:
    content = f.read()

content = content.replace('- [ ] Step 1: XP Ledger Module (Service & Controller)', '- [x] Step 1: XP Ledger Module (Service & Controller)')
content = content.replace('- [ ] Step 2: Badge Module (Service & Controller)', '- [x] Step 2: Badge Module (Service & Controller)')

with open('/home/adonay/.gemini/antigravity/brain/1ab44746-f2c1-43cd-9bef-c7f6a395b11a/phase-6-plan.md', 'w') as f:
    f.write(content)
