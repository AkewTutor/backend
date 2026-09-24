with open('src/services/session.service.ts', 'r') as f:
    content = f.read()

old_func = """      const shiftDate = (date: Date, w: number) => {
        if (w === 0) return new Date(date);
        const options: Intl.DateTimeFormatOptions = { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' };"""

new_func = """      const shiftDate = (date: Date, w: number) => {
        if (isNaN(date.getTime())) return new Date(date);
        if (w === 0) return new Date(date);
        const options: Intl.DateTimeFormatOptions = { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' };"""

if old_func in content:
    content = content.replace(old_func, new_func)
else:
    print("Could not find old func")

with open('src/services/session.service.ts', 'w') as f:
    f.write(content)
