with open('src/controllers/messaging.controller.ts', 'r') as f:
    content = f.read()

content = content.replace("const { cohortId } = req.params;", "const cohortId = req.params.cohortId as string;")

with open('src/controllers/messaging.controller.ts', 'w') as f:
    f.write(content)
