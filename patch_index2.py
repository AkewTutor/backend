with open('src/routes/index.ts', 'r') as f:
    content = f.read()

if "import rescheduleRouter from './reschedule.routes.js';" not in content:
    content = content.replace(
        "import sessionRouter from './session.routes.js';",
        "import sessionRouter from './session.routes.js';\nimport rescheduleRouter from './reschedule.routes.js';"
    )
    
    content = content.replace(
        "router.use('/sessions', sessionRouter);",
        "router.use('/sessions', sessionRouter);\nrouter.use('/reschedule', rescheduleRouter);"
    )

with open('src/routes/index.ts', 'w') as f:
    f.write(content)
