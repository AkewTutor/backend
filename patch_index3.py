with open('src/routes/index.ts', 'r') as f:
    content = f.read()

if "import weeklyAssessmentRouter from './weeklyAssessment.routes.js';" not in content:
    content = content.replace(
        "import rescheduleRouter from './reschedule.routes.js';",
        "import rescheduleRouter from './reschedule.routes.js';\nimport weeklyAssessmentRouter from './weeklyAssessment.routes.js';"
    )
    
    content = content.replace(
        "router.use('/reschedule', rescheduleRouter);",
        "router.use('/reschedule', rescheduleRouter);\nrouter.use('/assessments', weeklyAssessmentRouter);"
    )

with open('src/routes/index.ts', 'w') as f:
    f.write(content)
