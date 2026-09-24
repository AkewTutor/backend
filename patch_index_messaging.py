with open('src/routes/index.ts', 'r') as f:
    content = f.read()

if "import messagingRouter from './messaging.routes.js';" not in content:
    content = content.replace(
        "import weeklyAssessmentRouter from './weeklyAssessment.routes.js';",
        "import weeklyAssessmentRouter from './weeklyAssessment.routes.js';\nimport messagingRouter from './messaging.routes.js';"
    )
    
    content = content.replace(
        "router.use('/assessments', weeklyAssessmentRouter);",
        "router.use('/assessments', weeklyAssessmentRouter);\nrouter.use('/messaging', messagingRouter);"
    )

with open('src/routes/index.ts', 'w') as f:
    f.write(content)
