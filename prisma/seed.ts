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

  // 3. Seed PricingConfig (Phase 3)
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (adminUser) {
    const formats = [
      {
        format: 'ONE_TO_ONE',
        pricePerStudentPerHour: 400,
        totalPerHour: 400,
        platformSharePerHour: 100,
        tutorSharePerHour: 300,
      },
      {
        format: 'ONE_TO_THREE',
        pricePerStudentPerHour: 200,
        totalPerHour: 600,
        platformSharePerHour: 200,
        tutorSharePerHour: 400,
      },
      {
        format: 'ONE_TO_FIVE',
        pricePerStudentPerHour: 150,
        totalPerHour: 750,
        platformSharePerHour: 250,
        tutorSharePerHour: 500,
      },
    ];

    for (const config of formats) {
      const existingConfig = await prisma.pricingConfig.findUnique({
        where: { format: config.format as any },
      });
      if (!existingConfig) {
        await prisma.pricingConfig.create({
          data: {
            ...config,
            isActive: true,
            createdById: adminUser.id,
          },
        });
        console.log(`Created default PricingConfig for: ${config.format}`);
      }
    }
  } else {
    console.warn('Cannot seed PricingConfig: No ADMIN user found.');
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
