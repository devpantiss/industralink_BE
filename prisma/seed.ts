/**
 * Demo data for development: npm run db:seed (or npm run db:reset).
 * Wipes every table first, so it can be run again at any time.
 * All companies and people are fictional.
 */
import 'dotenv/config';
import { prisma } from '../src/db/prisma.js';

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

async function wipe() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

/** The demo data wipes every table, so it only runs on a database on this computer. */
function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to load demo data: "${host || 'unknown'}" is not a local database.`);
  }
}

async function main() {
  assertLocalDatabase();

  await wipe();

  await prisma.platformSettings.create({ data: { id: 1 } });

  // ── Admin ──
  await prisma.user.create({
    data: {
      role: 'admin',
      name: 'Neha Kapoor',
      email: 'admin@industrialink.demo',
      onboarded: true,
      createdAt: daysAgo(200),
      settings: { create: {} },
    },
  });

  // ── Companies and their HR users ──
  const konark = await prisma.company.create({
    data: {
      name: 'Konark Heavy Engineering',
      sector: 'metals',
      size: '1000+',
      city: 'Jharsuguda',
      state: 'Odisha',
      address: 'Plot 12, Industrial Estate',
      pincode: '768202',
      gstNumber: '21AAACK0000A1Z5',
      about: 'Steel fabrication and heavy engineering works in western Odisha.',
      hrName: 'Pradeep Mohanty',
      hrDesignation: 'HR Manager',
      hrPhone: '+919000000001',
      sites: ['Fabrication Shop 1', 'Power Plant', 'Main Gate Workshop'],
      hiringType: 'direct',
      verification: 'approved',
      verifiedAt: daysAgo(110),
      createdAt: daysAgo(120),
      members: {
        create: {
          role: 'employer',
          name: 'Pradeep Mohanty',
          email: 'hr@konark.demo',
          onboarded: true,
          createdAt: daysAgo(120),
          settings: { create: {} },
        },
      },
    },
    include: { members: true },
  });

  const westcoast = await prisma.company.create({
    data: {
      name: 'Westcoast Ports & Logistics',
      sector: 'shipping',
      size: '200–1000',
      city: 'Paradip',
      state: 'Odisha',
      gstNumber: '21AABCW0000B1Z2',
      about: 'Cargo handling and stevedoring at Paradip port.',
      hrName: 'Sunita Rath',
      hrDesignation: 'HR Executive',
      hrPhone: '+919000000002',
      hiringType: 'direct',
      verification: 'approved',
      verifiedAt: daysAgo(80),
      createdAt: daysAgo(90),
      members: {
        create: {
          role: 'employer',
          name: 'Sunita Rath',
          email: 'hr@westcoast.demo',
          onboarded: true,
          createdAt: daysAgo(90),
          settings: { create: {} },
        },
      },
    },
    include: { members: true },
  });

  await prisma.company.create({
    data: {
      name: 'Kalinganagar Manpower Services',
      sector: 'metals',
      size: '50–200',
      city: 'Jajpur',
      state: 'Odisha',
      gstNumber: '21AAFCK0000C1Z8',
      about: 'Labour contractor supplying skilled workers to steel plants.',
      hrPhone: '+919000000003',
      hiringType: 'agency',
      verification: 'pending',
      createdAt: daysAgo(2),
      members: {
        create: {
          role: 'employer',
          name: 'Raju Nayak',
          email: 'hr@kalinganagar.demo',
          onboarded: true,
          createdAt: daysAgo(2),
          settings: { create: {} },
        },
      },
    },
  });

  // ── Workers ──
  const rajan = await prisma.user.create({
    data: {
      role: 'worker',
      name: 'Ramesh Kumar',
      phone: '+919876543210',
      onboarded: true,
      createdAt: daysAgo(60),
      settings: { create: { language: 'or' } },
      workerProfile: {
        create: {
          trade: 'welder',
          experience: '3_5',
          qualifications: ['ITI', '10th'],
          licences: [],
          skills: ['Arc welding', 'MIG welding', 'Gas cutting'],
          languages: ['Odia', 'Hindi'],
          city: 'Sambalpur',
          state: 'Odisha',
          pincode: '768001',
          willingToRelocate: true,
          expectedPay: 20000,
          shiftPreference: 'any',
          availability: 'immediate',
          safetyTrainingHours: 24,
          workHistory: {
            create: [
              { company: 'Sai Fabricators, Sambalpur', role: 'Welder', fromYear: 2021, sortOrder: 0 },
              {
                company: 'Local workshop',
                role: 'Helper welder',
                fromYear: 2019,
                toYear: 2021,
                sortOrder: 1,
              },
            ],
          },
        },
      },
    },
  });

  const sanjay = await prisma.user.create({
    data: {
      role: 'worker',
      name: 'Sanjay Behera',
      phone: '+919811122233',
      onboarded: true,
      createdAt: daysAgo(40),
      settings: { create: {} },
      workerProfile: {
        create: {
          trade: 'crane_operator',
          experience: '5_plus',
          qualifications: ['12th'],
          licences: ['HMV'],
          skills: ['EOT crane', 'Mobile crane', 'Rigging signals'],
          languages: ['Odia', 'English'],
          city: 'Paradip',
          state: 'Odisha',
          willingToRelocate: false,
          expectedPay: 30000,
          availability: '15_days',
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      role: 'worker',
      name: 'Pooja Sahu',
      phone: '+919822233344',
      onboarded: false,
      createdAt: daysAgo(1),
      settings: { create: { language: 'hi' } },
      workerProfile: {
        create: { trade: 'electrician', experience: 'fresher', city: 'Cuttack', state: 'Odisha' },
      },
    },
  });

  await prisma.user.create({
    data: {
      role: 'worker',
      name: 'Manoj Patra',
      phone: '+919855566677',
      status: 'blocked',
      onboarded: true,
      createdAt: daysAgo(80),
      settings: { create: {} },
      workerProfile: { create: { trade: 'helper', experience: '1_2', city: 'Angul', state: 'Odisha' } },
    },
  });

  // ── Jobs ──
  const konarkHr = konark.members[0]!;
  const westcoastHr = westcoast.members[0]!;

  const welderJob = await prisma.job.create({
    data: {
      companyId: konark.id,
      createdById: konarkHr.id,
      title: 'Welder (ITI)',
      trade: 'welder',
      sector: 'metals',
      shift: 'rotational',
      workHours: '8 hours, 6 days a week',
      payMin: 18000,
      payMax: 22000,
      payType: 'in_hand',
      openings: 6,
      experience: '1_2',
      qualifications: ['ITI'],
      benefits: ['food', 'stay', 'pf_esi'],
      responsibilities: ['Arc and MIG welding of structures', 'Follow safety rules on the shop floor'],
      requirements: ['ITI Welder certificate', 'Able to read simple drawings'],
      city: 'Jharsuguda',
      state: 'Odisha',
      siteName: 'Fabrication Shop 1',
      hrPhone: '+919000000001',
      allowCalls: true,
      callHours: '10 AM – 6 PM',
      status: 'active',
      postedAt: daysAgo(10),
      deadline: daysFromNow(20),
      createdAt: daysAgo(10),
    },
  });

  await prisma.job.create({
    data: {
      companyId: konark.id,
      createdById: konarkHr.id,
      title: 'Electrician – Power Plant',
      trade: 'electrician',
      sector: 'metals',
      payMin: 22000,
      payMax: 26000,
      openings: 2,
      experience: '3_5',
      qualifications: ['ITI'],
      benefits: ['pf_esi'],
      responsibilities: ['Maintain plant electrical panels'],
      requirements: ['Electrician licence'],
      city: 'Jharsuguda',
      state: 'Odisha',
      siteName: 'Power Plant',
      status: 'draft',
    },
  });

  const craneJob = await prisma.job.create({
    data: {
      companyId: westcoast.id,
      createdById: westcoastHr.id,
      title: 'Gantry Crane Operator',
      trade: 'crane_operator',
      sector: 'shipping',
      shift: 'rotational',
      payMin: 28000,
      payMax: 34000,
      openings: 3,
      experience: '3_5',
      licences: ['HMV'],
      benefits: ['transport', 'overtime'],
      responsibilities: ['Operate gantry crane for container loading'],
      requirements: ['3+ years crane experience'],
      city: 'Paradip',
      state: 'Odisha',
      status: 'active',
      postedAt: daysAgo(5),
      deadline: daysFromNow(25),
      createdAt: daysAgo(5),
    },
  });

  await prisma.job.create({
    data: {
      companyId: westcoast.id,
      createdById: westcoastHr.id,
      title: 'Forklift Operator – Walk-in',
      trade: 'machine_operator',
      sector: 'shipping',
      jobType: 'walk_in',
      payMin: 700,
      payPeriod: 'day',
      openings: 10,
      city: 'Paradip',
      state: 'Odisha',
      walkIn: {
        date: daysFromNow(3).toISOString().slice(0, 10),
        time: '09:00',
        endTime: '13:00',
        address: 'Gate 2, Paradip Port',
        bring: 'Aadhaar copy, 2 photos',
      },
      status: 'active',
      postedAt: daysAgo(2),
      createdAt: daysAgo(2),
    },
  });

  await prisma.job.create({
    data: {
      companyId: konark.id,
      createdById: konarkHr.id,
      title: 'Helper – Material Handling',
      trade: 'helper',
      sector: 'metals',
      payMin: 550,
      payMax: 600,
      payPeriod: 'day',
      openings: 8,
      city: 'Jharsuguda',
      state: 'Odisha',
      status: 'closed',
      postedAt: daysAgo(45),
      createdAt: daysAgo(45),
    },
  });

  // ── Applications, saved jobs, notifications ──
  await prisma.application.create({
    data: {
      jobId: welderJob.id,
      workerId: rajan.id,
      stage: 'interview',
      seenAt: daysAgo(6),
      createdAt: daysAgo(8),
      events: {
        create: [
          { type: 'applied', createdAt: daysAgo(8) },
          { type: 'viewed', byUserId: konarkHr.id, createdAt: daysAgo(6) },
          { type: 'shortlisted', byUserId: konarkHr.id, createdAt: daysAgo(5) },
          { type: 'interview', byUserId: konarkHr.id, createdAt: daysAgo(4) },
        ],
      },
      interview: {
        create: {
          at: daysFromNow(2),
          place: 'Konark Heavy Engineering, Main Gate Workshop',
          contactPerson: 'Pradeep Mohanty',
          bring: 'Aadhaar, ITI certificate',
        },
      },
    },
  });

  await prisma.application.create({
    data: {
      jobId: craneJob.id,
      workerId: sanjay.id,
      createdAt: daysAgo(1),
      events: { create: [{ type: 'applied', createdAt: daysAgo(1) }] },
    },
  });

  await prisma.savedJob.create({ data: { workerId: rajan.id, jobId: craneJob.id } });

  await prisma.notification.create({
    data: {
      userId: rajan.id,
      title: 'Interview invite',
      body: 'Konark Heavy Engineering invited you for an interview for Welder (ITI).',
      link: '/worker/applications',
      createdAt: daysAgo(4),
    },
  });

  const counts = {
    users: await prisma.user.count(),
    companies: await prisma.company.count(),
    jobs: await prisma.job.count(),
    applications: await prisma.application.count(),
  };
  console.warn('Seeded demo data:', counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
