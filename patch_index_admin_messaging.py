with open('src/routes/index.ts', 'r') as f:
    content = f.read()

if "import adminMessagingRouter from './adminMessaging.routes.js';" not in content:
    content = content.replace(
        "import messagingRouter from './messaging.routes.js';",
        "import messagingRouter from './messaging.routes.js';\nimport adminMessagingRouter from './adminMessaging.routes.js';"
    )
    
    content = content.replace(
        "router.use('/messaging', messagingRouter);",
        "router.use('/messaging', messagingRouter);\nrouter.use('/admin/messaging', adminMessagingRouter);"
    )

with open('src/routes/index.ts', 'w') as f:
    f.write(content)
