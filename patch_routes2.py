with open('src/routes/messaging.routes.ts', 'r') as f:
    content = f.read()

content = content.replace("rateLimiter(30, 60), // 30 per minute", "rateLimiter({ max: 30, windowMs: 60 * 1000 }), // 30 per minute")

with open('src/routes/messaging.routes.ts', 'w') as f:
    f.write(content)
