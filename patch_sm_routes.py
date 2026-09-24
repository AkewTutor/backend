import re

with open('src/routes/index.ts', 'r') as f:
    content = f.read()

if 'import sessionMissRouter' not in content:
    content = content.replace(
        "import recordingConsentRouter from './recordingConsent.routes.js';",
        "import recordingConsentRouter from './recordingConsent.routes.js';\nimport sessionMissRouter from './sessionMiss.routes.js';"
    )
    
    content = content.replace(
        "router.use('/recording-consent', recordingConsentRouter);",
        "router.use('/recording-consent', recordingConsentRouter);\nrouter.use('/session-miss', sessionMissRouter);"
    )

with open('src/routes/index.ts', 'w') as f:
    f.write(content)
