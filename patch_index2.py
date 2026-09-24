with open('src/routes/index.ts', 'r') as f:
    content = f.read()

import_statement = "import { gamificationXPRouter, adminXPRouter } from './xp.routes.js';\nimport { gamificationBadgeRouter, adminBadgeRouter } from './badge.routes.js';"
content = content.replace("import { gamificationXPRouter, adminXPRouter } from './xp.routes.js';", import_statement)

mount_statement = """
router.use('/gamification', gamificationXPRouter);
router.use('/admin/students', adminXPRouter);
router.use('/gamification/badges', gamificationBadgeRouter);
router.use('/admin/badges', adminBadgeRouter);
"""
content = content.replace("""
router.use('/gamification', gamificationXPRouter);
router.use('/admin/students', adminXPRouter);
""", mount_statement.strip() + "\n")

with open('src/routes/index.ts', 'w') as f:
    f.write(content)
