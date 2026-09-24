with open('src/routes/index.ts', 'r') as f:
    content = f.read()

if 'import { libraryRouter, adminLibraryRouter }' not in content:
    content = content.replace(
        "import recordingRouter from './recording.routes.js';",
        "import recordingRouter from './recording.routes.js';\nimport { libraryRouter, adminLibraryRouter } from './library.routes.js';"
    )
    
    content = content.replace(
        "router.use('/recordings', recordingRouter);",
        "router.use('/recordings', recordingRouter);\nrouter.use('/library', libraryRouter);\nrouter.use('/admin/library', adminLibraryRouter);"
    )

with open('src/routes/index.ts', 'w') as f:
    f.write(content)
