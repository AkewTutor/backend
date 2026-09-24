import re

with open('src/routes/index.ts', 'r') as f:
    content = f.read()

if 'import recordingRouter' not in content:
    content = content.replace(
        "import sessionMissRouter from './sessionMiss.routes.js';",
        "import sessionMissRouter from './sessionMiss.routes.js';\nimport recordingRouter from './recording.routes.js';"
    )
    
    content = content.replace(
        "router.use('/session-miss', sessionMissRouter);",
        "router.use('/session-miss', sessionMissRouter);\nrouter.use('/recordings', recordingRouter);"
    )

with open('src/routes/index.ts', 'w') as f:
    f.write(content)
