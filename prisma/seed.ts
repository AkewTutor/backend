import { prisma } from '../src/config/db.js';
import bcrypt from 'bcrypt';

async function main() {
  console.log('Start seeding...');

  // 1. Seed Admin User
  const adminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@akewtutor.com';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD || 'Admin@123';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const admin = await prisma.user.create({
      data: {
        role: 'ADMIN',
        email: adminEmail,
        passwordHash,
        termsAcceptedAt: new Date(),
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`Created admin user with id: ${admin.id}`);
  } else {
    console.log('Admin user already exists.');
  }

  // 2. Seed Subjects
  const subjects = [
    'Mathematics',
    'Physics',
    'Chemistry',
    'Biology',
    'English',
    'Amharic',
    'History',
    'Geography',
  ];

  for (const subjectName of subjects) {
    const existingSubject = await prisma.subject.findUnique({
      where: { name: subjectName },
    });

    if (!existingSubject) {
      await prisma.subject.create({
        data: { name: subjectName },
      });
      console.log(`Created subject: ${subjectName}`);
    }
  }

  console.log('Seeding finished.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
