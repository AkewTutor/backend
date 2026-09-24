with open('tests/routes/messaging.routes.test.ts', 'r') as f:
    content = f.read()

content = content.replace("const cohortId = 'cohort-1';", "const cohortId = '11111111-1111-4111-8111-111111111111';")

with open('tests/routes/messaging.routes.test.ts', 'w') as f:
    f.write(content)
