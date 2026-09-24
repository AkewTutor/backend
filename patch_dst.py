with open('src/services/session.service.ts', 'r') as f:
    content = f.read()

old_loop = """  // To map the slots correctly, we need to generate dates
  // For each recurring slot, we create 4 sessions spaced by 7 days.
  const sessionsToCreate = [];
  for (const slot of recurringSlots) {
    for (let week = 0; week < 4; week++) {
      const start = new Date(slot.startTime);
      const end = new Date(slot.endTime);
      start.setDate(start.getDate() + week * 7);
      end.setDate(end.getDate() + week * 7);

      sessionsToCreate.push({
        cohortId,
        scheduledStart: start,
        scheduledEnd: end,
        status: 'SCHEDULED' as const,
      });
    }
  }"""

new_loop = """  // To map the slots correctly, we need to generate dates
  // For each recurring slot, we create 4 sessions spaced by 7 days.
  const sessionsToCreate = [];
  for (const slot of recurringSlots) {
    for (let week = 0; week < 4; week++) {
      const start = new Date(slot.startTime);
      const end = new Date(slot.endTime);
      
      const shiftDate = (date: Date, w: number) => {
        if (w === 0) return new Date(date);
        const options: Intl.DateTimeFormatOptions = { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' };
        const getNYHour = (d: Date) => parseInt(new Intl.DateTimeFormat('en-US', options).format(d), 10);
        
        const targetHour = getNYHour(date);
        const nextDate = new Date(date.getTime() + w * 7 * 24 * 60 * 60 * 1000);
        const newHour = getNYHour(nextDate);
        
        if (newHour !== targetHour) {
            let diff = newHour - targetHour;
            if (diff > 12) diff -= 24;
            if (diff < -12) diff += 24;
            nextDate.setTime(nextDate.getTime() - diff * 60 * 60 * 1000);
        }
        return nextDate;
      };

      sessionsToCreate.push({
        cohortId,
        scheduledStart: shiftDate(start, week),
        scheduledEnd: shiftDate(end, week),
        status: 'SCHEDULED' as const,
      });
    }
  }"""

if old_loop in content:
    content = content.replace(old_loop, new_loop)
else:
    print("Could not find old loop")

with open('src/services/session.service.ts', 'w') as f:
    f.write(content)
