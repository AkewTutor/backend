with open('src/routes/index.ts', 'r') as f:
    content = f.read()

import_statement = "import { gamificationBadgeRouter, adminBadgeRouter } from './badge.routes.js';\nimport { gamificationChallengeRouter, adminChallengeRouter } from './challenge.routes.js';"
content = content.replace("import { gamificationBadgeRouter, adminBadgeRouter } from './badge.routes.js';", import_statement)

mount_statement = """
router.use('/gamification/badges', gamificationBadgeRouter);
router.use('/admin/badges', adminBadgeRouter);
router.use('/gamification/challenges', gamificationChallengeRouter);
router.use('/admin/challenges', adminChallengeRouter);
"""
content = content.replace("""
router.use('/gamification/badges', gamificationBadgeRouter);
router.use('/admin/badges', adminBadgeRouter);
""", mount_statement.strip() + "\n")

with open('src/routes/index.ts', 'w') as f:
    f.write(content)
