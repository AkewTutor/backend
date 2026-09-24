with open('src/routes/sessionMiss.routes.ts', 'r') as f:
    content = f.read()

content = content.replace("requireRole(['ADMIN'])", "requireRole('ADMIN')")

with open('src/routes/sessionMiss.routes.ts', 'w') as f:
    f.write(content)
