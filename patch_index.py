with open('src/routes/index.ts', 'r') as f:
    content = f.read()

import_statement = "import { libraryRouter, adminLibraryRouter } from './library.routes.js';\nimport { gamificationXPRouter, adminXPRouter } from './xp.routes.js';"
content = content.replace("import { libraryRouter, adminLibraryRouter } from './library.routes.js';", import_statement)

mount_statement = """
router.use('/library', libraryRouter);
router.use('/admin/library', adminLibraryRouter);

// ── gamification-engagement ────────────────────────────────────────
router.use('/gamification', gamificationXPRouter);
router.use('/admin/students', adminXPRouter);
"""
content = content.replace("""
router.use('/library', libraryRouter);
router.use('/admin/library', adminLibraryRouter);
""", mount_statement.strip() + "\n")

with open('src/routes/index.ts', 'w') as f:
    f.write(content)
