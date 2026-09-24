with open('src/routes/adminMessaging.routes.ts', 'r') as f:
    content = f.read()

content = content.replace("requireRole(['ADMIN'])", "requireRole('ADMIN')")

with open('src/routes/adminMessaging.routes.ts', 'w') as f:
    f.write(content)
