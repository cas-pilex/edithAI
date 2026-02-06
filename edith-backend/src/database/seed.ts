import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create test user
  const passwordHash = await bcrypt.hash('TestPassword123!', 12);

  const testUser = await prisma.user.upsert({
    where: { email: 'test@edith.ai' },
    update: {},
    create: {
      email: 'test@edith.ai',
      passwordHash,
      name: 'Test User',
      timezone: 'America/New_York',
      locale: 'en',
      subscriptionTier: 'PRO',
      subscriptionStatus: 'ACTIVE',
      preferences: {
        create: {
          preferredChannel: 'EMAIL',
          digestFrequency: 'DAILY',
          language: 'en',
          workingHoursStart: '09:00',
          workingHoursEnd: '17:00',
          workingDays: [1, 2, 3, 4, 5],
          focusBlockDuration: 90,
          meetingBufferMinutes: 15,
          maxMeetingsPerDay: 6,
          communicationTone: 'MIXED',
          responseLength: 'CONCISE',
          preferredAirlines: ['United', 'Delta'],
          seatPreference: 'aisle',
          hotelStars: 4,
          dataRetentionDays: 365,
          allowAnalytics: true,
          marketingEmails: false,
        },
      },
      schedulingPreference: {
        create: {
          bufferBeforeMeetings: 5,
          bufferAfterMeetings: 5,
          focusTimeBlocks: [
            { day: 1, start: '09:00', end: '12:00' },
            { day: 2, start: '09:00', end: '12:00' },
            { day: 3, start: '09:00', end: '12:00' },
            { day: 4, start: '09:00', end: '12:00' },
            { day: 5, start: '09:00', end: '12:00' },
          ],
          noMeetingDays: [0, 6],
          preferredMeetingTimes: {
            morning: true,
            afternoon: true,
            evening: false,
          },
          maxConsecutiveMeetings: 3,
        },
      },
    },
    include: {
      preferences: true,
      schedulingPreference: true,
    },
  });

  console.log('✅ Created test user:', testUser.email);

  // Create sample contacts
  const contacts = [
    {
      userId: testUser.id,
      email: 'john.smith@example.com',
      firstName: 'John',
      lastName: 'Smith',
      company: 'Acme Corp',
      jobTitle: 'CEO',
      relationshipType: 'CLIENT' as const,
      importanceScore: 9,
      source: 'MANUAL' as const,
    },
    {
      userId: testUser.id,
      email: 'jane.doe@startup.io',
      firstName: 'Jane',
      lastName: 'Doe',
      company: 'Startup.io',
      jobTitle: 'CTO',
      relationshipType: 'PARTNER' as const,
      importanceScore: 8,
      source: 'MANUAL' as const,
    },
    {
      userId: testUser.id,
      email: 'investor@vc.com',
      firstName: 'Michael',
      lastName: 'Johnson',
      company: 'VC Partners',
      jobTitle: 'Partner',
      relationshipType: 'INVESTOR' as const,
      importanceScore: 10,
      source: 'MANUAL' as const,
    },
  ];

  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: {
        userId_email: {
          userId: contact.userId,
          email: contact.email,
        },
      },
      update: {},
      create: contact,
    });
  }

  console.log('✅ Created sample contacts');

  // Create sample tasks
  const tasks = [
    {
      userId: testUser.id,
      title: 'Review Q4 financial report',
      description: 'Go through the Q4 numbers and prepare summary for board meeting',
      priority: 'HIGH' as const,
      status: 'TODO' as const,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      estimatedMinutes: 60,
      tags: ['finance', 'board'],
      source: 'MANUAL' as const,
    },
    {
      userId: testUser.id,
      title: 'Prepare investor presentation',
      description: 'Create slides for upcoming Series B pitch',
      priority: 'URGENT' as const,
      status: 'IN_PROGRESS' as const,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      estimatedMinutes: 180,
      tags: ['fundraising', 'presentation'],
      source: 'MANUAL' as const,
    },
    {
      userId: testUser.id,
      title: 'Schedule team offsite',
      priority: 'MEDIUM' as const,
      status: 'TODO' as const,
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      estimatedMinutes: 30,
      tags: ['team', 'planning'],
      source: 'MANUAL' as const,
    },
  ];

  for (const task of tasks) {
    await prisma.task.create({
      data: task,
    });
  }

  console.log('✅ Created sample tasks');

  // Create initial success metrics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.successMetrics.upsert({
    where: {
      userId_date: {
        userId: testUser.id,
        date: today,
      },
    },
    update: {},
    create: {
      userId: testUser.id,
      date: today,
      emailsProcessed: 0,
      emailsDrafted: 0,
      meetingsScheduled: 0,
      tasksCompleted: 0,
      timeSavedMinutes: 0,
      travelBooked: 0,
      contactsNurtured: 0,
    },
  });

  console.log('✅ Created initial success metrics');

  console.log(`
╔══════════════════════════════════════════════════════════╗
║              DATABASE SEEDED SUCCESSFULLY                ║
╠══════════════════════════════════════════════════════════╣
║  Test User:                                              ║
║    Email:    test@edith.ai                               ║
║    Password: TestPassword123!                            ║
║                                                          ║
║  Sample Data:                                            ║
║    - 3 contacts                                          ║
║    - 3 tasks                                             ║
║    - User preferences configured                         ║
╚══════════════════════════════════════════════════════════╝
  `);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
