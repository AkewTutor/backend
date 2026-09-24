with open('src/services/xp.service.ts', 'r') as f:
    content = f.read()

content = content.replace("student.user.firstName", "student.user?.firstName")
content = content.replace("student.user.lastName", "student.user?.lastName")
content = content.replace("other.user.firstName", "other.user?.firstName")
content = content.replace("other.user.lastName", "other.user?.lastName")

with open('src/services/xp.service.ts', 'w') as f:
    f.write(content)
