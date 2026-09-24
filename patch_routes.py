import re

with open('src/routes/index.ts', 'r') as f:
    content = f.read()

if 'import sessionRouter' not in content:
    content = content.replace(
        "import formatSwitchRouter from './formatSwitch.routes.js';",
        "import formatSwitchRouter from './formatSwitch.routes.js';\nimport sessionRouter from './session.routes.js';"
    )

    # Looking for a good place to mount. The spec says Phase 4 mounts in class-delivery-library block.
    # Let's see what exists.
    if '// ── class-delivery-library ─────────────────────────────────────────' not in content:
        content = content.replace(
            "export default router;",
            "// ── class-delivery-library ─────────────────────────────────────────\nrouter.use('/sessions', sessionRouter);\n\nexport default router;"
        )
    else:
        content = content.replace(
            "// ── class-delivery-library ─────────────────────────────────────────",
            "// ── class-delivery-library ─────────────────────────────────────────\nrouter.use('/sessions', sessionRouter);"
        )

with open('src/routes/index.ts', 'w') as f:
    f.write(content)
