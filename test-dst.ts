function shiftDate(date: Date, w: number) {
  if (w === 0) return new Date(date);
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hourCycle: 'h23',
  };
  const getNYHour = (d: Date) => parseInt(new Intl.DateTimeFormat('en-US', options).format(d), 10);

  const targetHour = getNYHour(date);
  const nextDate = new Date(date.getTime() + w * 7 * 24 * 60 * 60 * 1000);
  let newHour = getNYHour(nextDate);

  if (newHour !== targetHour) {
    let diff = newHour - targetHour;
    if (diff > 12) diff -= 24;
    if (diff < -12) diff += 24;
    nextDate.setTime(nextDate.getTime() - diff * 60 * 60 * 1000);
  }
  return nextDate;
}

const start = new Date('2026-03-01T21:00:00Z'); // 16:00 NY
for (let i = 0; i < 4; i++) {
  const d = shiftDate(start, i);
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(d);
  console.log(`Week ${i}: ${d.toISOString()} -> NY Hour: ${hour}`);
}
