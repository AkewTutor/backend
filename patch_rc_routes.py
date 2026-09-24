import re

with open('src/routes/index.ts', 'r') as f:
    content = f.read()

if 'import recordingConsentRouter' not in content:
    content = content.replace(
        "import sessionRouter from './session.routes.js';",
        "import sessionRouter from './session.routes.js';\nimport recordingConsentRouter from './recordingConsent.routes.js';"
    )
    
    content = content.replace(
        "router.use('/sessions', sessionRouter);",
        "router.use('/sessions', sessionRouter);\nrouter.use('/recording-consent', recordingConsentRouter);"
    )

with open('src/routes/index.ts', 'w') as f:
    f.write(content)
