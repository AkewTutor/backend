import { prisma } from '../config/db.js';

export const updateStreakOnActivity = async (studentId: string, activityDate: string) => {
  const current = await prisma.streak.findUnique({
    where: { studentId },
  });

  const now = new Date(activityDate);
  const nowStr = now.toISOString().split('T')[0];

  let currentStreakDays = 1;
  let longestStreakDays = 1;
  let milestoneReached = null;

  if (current && current.lastActivityDate) {
    const lastStr = current.lastActivityDate.toISOString().split('T')[0];
    const diffTime = new Date(nowStr).getTime() - new Date(lastStr).getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

    if (diffDays === 1) {
      currentStreakDays = current.currentStreakDays + 1;
      longestStreakDays = Math.max(current.longestStreakDays, currentStreakDays);
    } else if (diffDays === 0) {
      // same day, no change
      currentStreakDays = current.currentStreakDays;
      longestStreakDays = current.longestStreakDays;
    } else {
      // gap, reset
      currentStreakDays = 1;
      longestStreakDays = Math.max(current.longestStreakDays, 1);
    }
  }

  // Check milestones ONLY if we just incremented (i.e. we aren't same-day updating or gap-resetting, although 1 isn't a milestone)
  // Wait, diffDays === 1 is when we increment
  if (current && current.lastActivityDate) {
    const lastStr = current.lastActivityDate.toISOString().split('T')[0];
    const diffTime = new Date(nowStr).getTime() - new Date(lastStr).getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
    if (diffDays === 1 && [7, 30, 90].includes(currentStreakDays)) {
      milestoneReached = currentStreakDays;
    }
  }

  const result = await prisma.streak.upsert({
    where: { studentId },
    update: {
      currentStreakDays,
      longestStreakDays,
      lastActivityDate: now,
    },
    create: {
      studentId,
      currentStreakDays,
      longestStreakDays,
      lastActivityDate: now,
    },
  });

  return milestoneReached ? { ...result, milestoneReached } : result;
};

export const resetStreakOnGap = async (studentId: string) => {
  const current = await prisma.streak.findUnique({
    where: { studentId },
  });

  if (!current) {
    throw new Error('Streak not found');
  }

  return await prisma.streak.update({
    where: { studentId },
    data: {
      currentStreakDays: 0,
      // longestStreakDays is preserved
    },
  });
};
