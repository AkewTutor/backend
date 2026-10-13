// Save as: backend/prisma/seed-tutors.ts
// Run from backend/:  npx tsx prisma/seed-tutors.ts
// Prerequisite: t1@test.local exists and has availability slots (guide test 2.9).
// Safe to run twice (skips tutors that already exist).
import bcrypt from 'bcrypt';
import { prisma } from '../src/config/db.js';

const PASSWORD = 'Passw0rd!23';
const tutors = [
  { email: 't3@test.local', subjects: ['Mathematics', 'Chemistry'] },
  { email: 't4@test.local', subjects: ['Physics', 'Mathematics'] },
  { email: 't5@test.local', subjects: ['English', 'Biology'] },
];

async function main() {
  const t1 = await prisma.user.findUnique({
    where: { email: 't1@test.local' },
    include: { tutorProfile: { include: { availabilitySlots: true } } },
  });
  const slots = t1?.tutorProfile?.availabilitySlots ?? [];
  if (!slots.length) throw new Error('Give t1 availability slots first (guide test 2.9).');

  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const t of tutors) {
    if (await prisma.user.findUnique({ where: { email: t.email } })) {
      console.log('exists, skipped', t.email);
      continue;
    }
    const subs = await prisma.subject.findMany({ where: { name: { in: t.subjects } } });
    const byName = new Map(subs.map((s) => [s.name, s.id]));
    await prisma.user.create({
      data: {
        role: 'TUTOR',
        email: t.email,
        name: t.email.split('@')[0],
        passwordHash: hash,
        emailVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
        tutorProfile: {
          create: {
            bio: 'Seeded tutor for testing.',
            experienceDescription: '5 years of tutoring experience.',
            verificationStatus: 'VERIFIED',
            verifiedAt: new Date(),
            subjectRankings: {
              create: t.subjects.map((n, i) => ({ subjectId: byName.get(n)!, rank: i + 1 })),
            },
            availabilitySlots: {
              create: slots.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                isRecurring: s.isRecurring,
              })),
            },
          },
        },
      },
    });
    console.log('created', t.email);
  }
}

main().finally(() => prisma.$disconnect());
