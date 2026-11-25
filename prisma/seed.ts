/**
 * Demo data for development: npm run db:seed (or npm run db:reset).
 * Wipes every table first, so it can be run again at any time. Local databases only.
 *
 * One consistent story in the Odisha industrial belt: four fictional companies, nine
 * workers, and applications at every hiring stage with their timeline, notifications
 * and chats. All companies, people and phone numbers are made up.
 *
 * Demo logins: worker 9876543210 (Ramesh), HR hr@konark.demo, admin admin@industrialink.demo.
 */
import 'dotenv/config';
import { rmSync } from 'node:fs';
import { prisma } from '../src/db/prisma.js';
import type {
  ApplicationStage,
  Job,
  Prisma,
  TimelineEventType,
  User,
} from '../src/generated/prisma/client.js';
import { previewOf } from '../src/modules/messages/message.mapper.js';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY);
/** A date `days` from today at a round time, e.g. an interview at 10:00. */
const dayAt = (days: number, hour: number) => {
  const date = daysFromNow(days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

/** Empties every table, and the uploaded files that belonged to them. */
async function wipe() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
  rmSync(process.env.UPLOAD_DIR ?? 'uploads', { recursive: true, force: true });
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

// ───────────────────────── Builders ─────────────────────────

interface CompanySpec {
  name: string;
  sector: string;
  size: string;
  city: string;
  state?: string;
  address: string;
  pincode: string;
  gstNumber: string;
  about: string;
  hr: { name: string; designation: string; email: string; phone: string };
  sites?: string[];
  hiringType: 'direct' | 'agency';
  approvedDaysAgo?: number;
  joinedDaysAgo: number;
}

async function createCompany(spec: CompanySpec) {
  const company = await prisma.company.create({
    data: {
      name: spec.name,
      sector: spec.sector,
      size: spec.size,
      city: spec.city,
      state: spec.state ?? 'Odisha',
      address: spec.address,
      pincode: spec.pincode,
      gstNumber: spec.gstNumber,
      about: spec.about,
      hrName: spec.hr.name,
      hrDesignation: spec.hr.designation,
      hrPhone: spec.hr.phone,
      sites: spec.sites ?? [],
      hiringType: spec.hiringType,
      verification: spec.approvedDaysAgo === undefined ? 'pending' : 'approved',
      verifiedAt: spec.approvedDaysAgo === undefined ? null : daysAgo(spec.approvedDaysAgo),
      createdAt: daysAgo(spec.joinedDaysAgo),
      members: {
        create: {
          role: 'employer',
          name: spec.hr.name,
          email: spec.hr.email,
          onboarded: true,
          createdAt: daysAgo(spec.joinedDaysAgo),
          settings: { create: {} },
        },
      },
    },
    include: { members: true },
  });
  return { ...company, hr: company.members[0]! };
}

type Company = Awaited<ReturnType<typeof createCompany>>;

interface WorkerSpec {
  name: string;
  phone: string;
  trade: string;
  experience: string;
  city: string;
  pincode?: string;
  gender: 'male' | 'female';
  language?: 'en' | 'hi' | 'or';
  qualifications?: string[];
  licences?: string[];
  skills?: string[];
  languages?: string[];
  expectedPay?: number;
  willingToRelocate?: boolean;
  availability?: string;
  safetyTrainingHours?: number;
  history?: { company: string; role: string; fromYear: number; toYear?: number }[];
  onboarded?: boolean;
  blocked?: boolean;
  joinedDaysAgo: number;
}

async function createWorker(spec: WorkerSpec) {
  return prisma.user.create({
    data: {
      role: 'worker',
      name: spec.name,
      phone: spec.phone,
      status: spec.blocked ? 'blocked' : 'active',
      onboarded: spec.onboarded ?? true,
      createdAt: daysAgo(spec.joinedDaysAgo),
      settings: { create: { language: spec.language ?? 'en' } },
      workerProfile: {
        create: {
          trade: spec.trade,
          experience: spec.experience,
          qualifications: spec.qualifications ?? [],
          licences: spec.licences ?? [],
          skills: spec.skills ?? [],
          languages: spec.languages ?? ['Odia', 'Hindi'],
          city: spec.city,
          state: 'Odisha',
          pincode: spec.pincode,
          gender: spec.gender,
          willingToRelocate: spec.willingToRelocate ?? false,
          expectedPay: spec.expectedPay,
          shiftPreference: 'any',
          availability: spec.availability ?? 'immediate',
          safetyTrainingHours: spec.safetyTrainingHours,
          workHistory: {
            create: (spec.history ?? []).map((job, sortOrder) => ({ ...job, sortOrder })),
          },
        },
      },
    },
  });
}

/** A job. City, sector and HR phone default to the company's. */
type JobSpec = Omit<Prisma.JobUncheckedCreateInput, 'companyId' | 'city' | 'state' | 'sector'> & {
  city?: string;
  sector?: string;
  postedDaysAgo?: number;
};

async function createJob(company: Company, { postedDaysAgo, ...job }: JobSpec) {
  const posted = postedDaysAgo === undefined ? undefined : daysAgo(postedDaysAgo);
  return prisma.job.create({
    data: {
      companyId: company.id,
      createdById: company.hr.id,
      state: 'Odisha',
      city: company.city!,
      sector: company.sector!,
      hrPhone: company.hrPhone,
      postedAt: posted,
      createdAt: posted ?? daysAgo(1),
      ...job,
    },
  });
}

/** What the worker is told at each step (the same texts the API sends). */
function workerUpdate(type: TimelineEventType, job: Job, company: Company, offerPay?: string) {
  switch (type) {
    case 'shortlisted':
      return `You were shortlisted for ${job.title}.`;
    case 'interview':
      return `${company.name} invited you for an interview for ${job.title}.`;
    case 'offer':
      return `${company.name} offered you ${job.title} at ${offerPay}. Please reply.`;
    case 'hired':
      return `You are hired for ${job.title}. Congratulations!`;
    case 'rejected':
      return `${company.name} did not select you this time for ${job.title}.`;
    default:
      return null;
  }
}

/** Notifications older than this many days are already read. */
const READ_AFTER_DAYS = 2;

interface ApplicationSpec {
  job: Job;
  company: Company;
  worker: User;
  /** The timeline after "applied", oldest first. "viewed" is HR opening the profile. */
  steps: { type: TimelineEventType; daysAgo: number; note?: string; isPrivate?: boolean }[];
  appliedDaysAgo: number;
  interview?: { at: Date; place: string; contactPerson: string; bring: string; attending?: boolean };
  offer?: { pay: number; joiningDate: Date; place: string; note?: string; accepted?: boolean };
  rejectionNote?: string;
}

/** An application with its timeline, interview / offer, and the notifications both sides got. */
async function createApplication(spec: ApplicationSpec) {
  const { job, company, worker } = spec;
  const last = spec.steps.at(-1);
  const stage = (last && last.type !== 'viewed' ? last.type : 'applied') as ApplicationStage;
  const viewed = spec.steps.find((step) => step.type !== 'withdrawn');
  const offerPay = spec.offer && `₹${spec.offer.pay.toLocaleString('en-IN')}/month`;
  const offerStep = spec.steps.find((step) => step.type === 'offer');
  const interviewStep = spec.steps.find((step) => step.type === 'interview');

  const application = await prisma.application.create({
    data: {
      jobId: job.id,
      workerId: worker.id,
      stage,
      seenAt: viewed ? daysAgo(viewed.daysAgo) : null,
      rejectionNote: spec.rejectionNote,
      offerResponse: spec.offer?.accepted ? 'accepted' : undefined,
      createdAt: daysAgo(spec.appliedDaysAgo),
      events: {
        create: [
          { type: 'applied', createdAt: daysAgo(spec.appliedDaysAgo) },
          ...spec.steps.map((step) => ({
            type: step.type,
            note: step.note,
            isPrivate: step.isPrivate ?? false,
            byUserId: step.type === 'withdrawn' ? worker.id : company.hr.id,
            createdAt: daysAgo(step.daysAgo),
          })),
        ],
      },
      interview: spec.interview && {
        create: {
          at: spec.interview.at,
          place: spec.interview.place,
          contactPerson: spec.interview.contactPerson,
          bring: spec.interview.bring,
          response: spec.interview.attending ? 'attending' : undefined,
          respondedAt: spec.interview.attending ? daysAgo(interviewStep!.daysAgo - 0.1) : undefined,
          createdAt: daysAgo(interviewStep!.daysAgo),
        },
      },
      offer: spec.offer && {
        create: {
          pay: spec.offer.pay,
          payPeriod: 'month',
          payType: 'in_hand',
          joiningDate: spec.offer.joiningDate,
          place: spec.offer.place,
          note: spec.offer.note,
          sentAt: daysAgo(offerStep!.daysAgo),
        },
      },
    },
  });

  const read = (at: Date) => (Date.now() - at.getTime() > READ_AFTER_DAYS * DAY ? at : null);
  const notes: { userId: string; title: string; body: string; link: string; createdAt: Date }[] = [];
  const toHr = (title: string, body: string, days: number) =>
    notes.push({
      userId: company.hr.id,
      title,
      body,
      link: `/employer/jobs/${job.id}`,
      createdAt: daysAgo(days),
    });

  toHr('New applicant', `${worker.name} applied for ${job.title}.`, spec.appliedDaysAgo);
  for (const step of spec.steps) {
    if (step.type === 'withdrawn') {
      toHr('Application withdrawn', `A candidate withdrew their application for ${job.title}.`, step.daysAgo);
      continue;
    }
    const body = workerUpdate(step.type, job, company, offerPay);
    if (body) {
      notes.push({
        userId: worker.id,
        title: 'Application update',
        body,
        link: `/worker/applications/${application.id}`,
        createdAt: daysAgo(step.daysAgo),
      });
    }
  }
  if (spec.interview?.attending) {
    toHr(
      'Interview confirmed',
      `${worker.name} will attend the interview for ${job.title}.`,
      interviewStep!.daysAgo - 0.1,
    );
  }
  if (spec.offer?.accepted) {
    const body = `${worker.name} accepted your offer for ${job.title}. Mark them hired once they join.`;
    toHr('Offer accepted', body, offerStep!.daysAgo - 0.5);
  }
  await prisma.notification.createMany({
    data: notes.map((note) => ({ ...note, readAt: read(note.createdAt) })),
  });

  return application;
}

type ChatLine = [from: 'worker' | 'hr', daysAgo: number, text: string];

/**
 * A chat on an application, with the inbox summary filled in like the API keeps it.
 * Each side has read everything up to the given time; later messages from the other
 * side count as unread (and the sender sees ✓ instead of ✓✓).
 */
async function createChat(
  application: { id: string; workerId: string },
  company: Company,
  worker: User,
  openedDaysAgo: number,
  lines: ChatLine[],
  readUntil: { worker: number; hr: number },
) {
  const workerRead = daysAgo(readUntil.worker);
  const hrRead = daysAgo(readUntil.hr);
  const messages = lines.map(([from, days, text]) => ({
    applicationId: application.id,
    senderId: from === 'worker' ? worker.id : company.hr.id,
    senderRole: from === 'worker' ? ('worker' as const) : ('employer' as const),
    text,
    createdAt: daysAgo(days),
  }));
  await prisma.message.createMany({ data: messages });

  const last = messages.at(-1)!;
  await prisma.conversation.create({
    data: {
      applicationId: application.id,
      workerId: worker.id,
      companyId: company.id,
      lastMessageAt: last.createdAt,
      lastMessageText: previewOf(last.text),
      lastSenderId: last.senderId,
      workerUnread: messages.filter((m) => m.senderRole === 'employer' && m.createdAt > workerRead).length,
      companyUnread: messages.filter((m) => m.senderRole === 'worker' && m.createdAt > hrRead).length,
      workerLastReadAt: workerRead,
      companyLastReadAt: hrRead,
      createdAt: daysAgo(openedDaysAgo),
    },
  });
}

// ───────────────────────── The demo data ─────────────────────────

async function main() {
  assertLocalDatabase();
  await wipe();

  await prisma.platformSettings.create({ data: { id: 1 } });

  const admin = await prisma.user.create({
    data: {
      role: 'admin',
      name: 'Neha Kapoor',
      email: 'admin@industrialink.demo',
      onboarded: true,
      createdAt: daysAgo(200),
      settings: { create: {} },
    },
  });

  // ── Companies ──
  const konark = await createCompany({
    name: 'Konark Heavy Engineering',
    sector: 'metals',
    size: '1000+',
    city: 'Jharsuguda',
    address: 'Plot 12, Industrial Estate, Jharsuguda',
    pincode: '768202',
    gstNumber: '21AAACK4821A1Z5',
    about: 'Steel fabrication and heavy engineering for power and steel plants in western Odisha.',
    hr: {
      name: 'Pradeep Mohanty',
      designation: 'HR Manager',
      email: 'hr@konark.demo',
      phone: '+919000000001',
    },
    sites: ['Fabrication Shop 1', 'Power Plant', 'Main Gate Workshop'],
    hiringType: 'direct',
    approvedDaysAgo: 110,
    joinedDaysAgo: 120,
  });

  const westcoast = await createCompany({
    name: 'Westcoast Ports & Logistics',
    sector: 'shipping',
    size: '200–1000',
    city: 'Paradip',
    address: 'Port Road, near Gate 2, Paradip',
    pincode: '754142',
    gstNumber: '21AABCW7314B1Z2',
    about: 'Cargo handling, ship repair and transport at Paradip port.',
    hr: {
      name: 'Sunita Rath',
      designation: 'HR Executive',
      email: 'hr@westcoast.demo',
      phone: '+919000000002',
    },
    sites: ['Berth 4', 'Ship Repair Yard', 'Container Yard'],
    hiringType: 'direct',
    approvedDaysAgo: 80,
    joinedDaysAgo: 90,
  });

  const angul = await createCompany({
    name: 'Angul Mineral Works',
    sector: 'mining',
    size: '200–1000',
    city: 'Talcher',
    address: 'Mine Office, Balanda Road, Talcher',
    pincode: '759100',
    gstNumber: '21AAFCA5160C1Z9',
    about: 'Open-cast coal and mineral mining in the Talcher–Angul belt.',
    hr: {
      name: 'Bikash Pradhan',
      designation: 'Personnel Officer',
      email: 'hr@angulminerals.demo',
      phone: '+919000000004',
    },
    sites: ['Pit 2', 'Mine Substation', 'Site Office'],
    hiringType: 'direct',
    approvedDaysAgo: 60,
    joinedDaysAgo: 65,
  });

  // Signed up two days ago, waiting for admin approval: its job stays a draft.
  const kalinganagar = await createCompany({
    name: 'Kalinganagar Manpower Services',
    sector: 'metals',
    size: '50–200',
    city: 'Jajpur',
    address: 'Main Road, Kalinganagar, Jajpur',
    pincode: '755026',
    gstNumber: '21AAFCK2207D1Z8',
    about: 'Labour contractor supplying skilled workers to steel plants in Kalinganagar.',
    hr: {
      name: 'Raju Nayak',
      designation: 'Proprietor',
      email: 'hr@kalinganagar.demo',
      phone: '+919000000003',
    },
    hiringType: 'agency',
    joinedDaysAgo: 2,
  });

  // ── Workers ──
  const ramesh = await createWorker({
    name: 'Ramesh Kumar',
    phone: '+919876543210',
    trade: 'welder',
    experience: '3_5',
    city: 'Sambalpur',
    pincode: '768001',
    gender: 'male',
    language: 'or',
    qualifications: ['ITI', '10th'],
    skills: ['Arc welding', 'MIG welding', 'Gas cutting'],
    expectedPay: 20000,
    willingToRelocate: true,
    safetyTrainingHours: 24,
    history: [
      { company: 'Sai Fabricators, Sambalpur', role: 'Welder', fromYear: 2021 },
      { company: 'Maa Samaleswari Workshop', role: 'Helper welder', fromYear: 2019, toYear: 2021 },
    ],
    joinedDaysAgo: 60,
  });

  const sanjay = await createWorker({
    name: 'Sanjay Behera',
    phone: '+919811122233',
    trade: 'crane_operator',
    experience: '5_plus',
    city: 'Paradip',
    pincode: '754142',
    gender: 'male',
    qualifications: ['12th'],
    licences: ['HMV'],
    skills: ['EOT crane', 'Gantry crane', 'Rigging signals'],
    languages: ['Odia', 'English'],
    expectedPay: 30000,
    availability: '15_days',
    history: [{ company: 'Haldia Dock Services', role: 'Crane operator', fromYear: 2017 }],
    joinedDaysAgo: 40,
  });

  const bijay = await createWorker({
    name: 'Bijay Das',
    phone: '+919833344455',
    trade: 'fitter',
    experience: '3_5',
    city: 'Jharsuguda',
    pincode: '768201',
    gender: 'male',
    qualifications: ['ITI', '10th'],
    skills: ['Structural fitting', 'Reading drawings', 'Grinding'],
    expectedPay: 19000,
    history: [{ company: 'Rourkela fabrication yard', role: 'Fitter', fromYear: 2020 }],
    joinedDaysAgo: 25,
  });

  const prakash = await createWorker({
    name: 'Prakash Sethi',
    phone: '+919866677788',
    trade: 'electrician',
    experience: '5_plus',
    city: 'Angul',
    pincode: '759122',
    gender: 'male',
    qualifications: ['ITI', 'Diploma'],
    licences: ['Wireman licence'],
    skills: ['HT panels', 'Motor rewinding', 'Substation maintenance'],
    expectedPay: 27000,
    safetyTrainingHours: 40,
    history: [{ company: 'Angul power plant (contract)', role: 'Electrician', fromYear: 2016, toYear: 2025 }],
    joinedDaysAgo: 45,
  });

  const arjun = await createWorker({
    name: 'Arjun Majhi',
    phone: '+919844455566',
    trade: 'driver',
    experience: '3_5',
    city: 'Talcher',
    pincode: '759100',
    gender: 'male',
    qualifications: ['10th'],
    licences: ['HMV'],
    skills: ['Dumper', 'Tipper', 'Trailer'],
    expectedPay: 25000,
    history: [{ company: 'Coal transport contractor, Talcher', role: 'Tipper driver', fromYear: 2021 }],
    joinedDaysAgo: 20,
  });

  const sasmita = await createWorker({
    name: 'Sasmita Nayak',
    phone: '+919877788899',
    trade: 'machine_operator',
    experience: '1_2',
    city: 'Paradip',
    pincode: '754142',
    gender: 'female',
    qualifications: ['12th'],
    skills: ['Forklift', 'Stock counting'],
    expectedPay: 15000,
    joinedDaysAgo: 6,
  });

  const deepak = await createWorker({
    name: 'Deepak Mallick',
    phone: '+919888899900',
    trade: 'security',
    experience: '3_5',
    city: 'Jharsuguda',
    pincode: '768202',
    gender: 'male',
    qualifications: ['10th'],
    skills: ['Gate register', 'CCTV watching'],
    expectedPay: 14000,
    joinedDaysAgo: 30,
  });

  // Signed up yesterday and has not finished the welcome steps.
  const pooja = await createWorker({
    name: 'Pooja Sahu',
    phone: '+919822233344',
    trade: 'electrician',
    experience: 'fresher',
    city: 'Cuttack',
    gender: 'female',
    language: 'hi',
    onboarded: false,
    joinedDaysAgo: 1,
  });

  const manoj = await createWorker({
    name: 'Manoj Patra',
    phone: '+919855566677',
    trade: 'helper',
    experience: '1_2',
    city: 'Angul',
    gender: 'male',
    blocked: true,
    joinedDaysAgo: 80,
  });

  // ── Jobs ──
  const welderJob = await createJob(konark, {
    title: 'Welder (ITI)',
    trade: 'welder',
    shift: 'rotational',
    workHours: '8 hours, 6 days a week',
    payMin: 18000,
    payMax: 22000,
    payType: 'in_hand',
    openings: 6,
    experience: '1_2',
    qualifications: ['ITI'],
    benefits: ['food', 'stay', 'pf_esi'],
    responsibilities: ['Arc and MIG welding of steel structures', 'Follow safety rules on the shop floor'],
    requirements: ['ITI Welder certificate', 'Able to read simple drawings'],
    siteName: 'Fabrication Shop 1',
    allowCalls: true,
    callHours: '10 AM – 6 PM',
    status: 'active',
    postedDaysAgo: 10,
    deadline: daysFromNow(20),
  });

  const fitterJob = await createJob(konark, {
    title: 'Fitter – Fabrication',
    trade: 'fitter',
    workHours: '8 hours, 6 days a week',
    payMin: 17000,
    payMax: 21000,
    payType: 'in_hand',
    openings: 4,
    experience: '3_5',
    qualifications: ['ITI'],
    benefits: ['food', 'pf_esi'],
    responsibilities: ['Fit and align structural parts as per drawing', 'Work with the welding team'],
    requirements: ['ITI Fitter certificate', '3 years in fabrication'],
    siteName: 'Fabrication Shop 1',
    allowCalls: true,
    callHours: '10 AM – 6 PM',
    status: 'active',
    postedDaysAgo: 6,
    deadline: daysFromNow(24),
  });

  const securityJob = await createJob(konark, {
    title: 'Security Guard – Plant Gate',
    trade: 'security',
    shift: 'night',
    workHours: '12 hours, 6 nights a week',
    payMin: 13000,
    payMax: 15000,
    payType: 'in_hand',
    openings: 5,
    experience: '1_2',
    qualifications: ['10th'],
    benefits: ['stay', 'pf_esi'],
    responsibilities: ['Check vehicles and visitors at the main gate', 'Keep the gate register'],
    requirements: ['Night shift', 'Basic reading and writing'],
    siteName: 'Main Gate Workshop',
    status: 'active',
    postedDaysAgo: 15,
    deadline: daysFromNow(15),
  });

  await createJob(konark, {
    title: 'Electrician – Power Plant',
    trade: 'electrician',
    payMin: 22000,
    payMax: 26000,
    openings: 2,
    experience: '3_5',
    qualifications: ['ITI'],
    benefits: ['pf_esi'],
    responsibilities: ['Maintain plant electrical panels'],
    requirements: ['Wireman licence'],
    siteName: 'Power Plant',
    status: 'draft',
  });

  await createJob(konark, {
    title: 'Helper – Material Handling',
    trade: 'helper',
    payMin: 550,
    payMax: 600,
    payPeriod: 'day',
    openings: 8,
    benefits: ['food'],
    responsibilities: ['Load and unload steel plates'],
    status: 'closed',
    postedDaysAgo: 45,
  });

  const craneJob = await createJob(westcoast, {
    title: 'Gantry Crane Operator',
    trade: 'crane_operator',
    shift: 'rotational',
    workHours: '8 hours, rotating shifts',
    payMin: 28000,
    payMax: 34000,
    payType: 'in_hand',
    openings: 3,
    experience: '3_5',
    licences: ['HMV'],
    benefits: ['transport', 'overtime'],
    responsibilities: ['Operate the gantry crane for container loading', 'Daily crane checks'],
    requirements: ['3+ years crane experience'],
    siteName: 'Berth 4',
    allowCalls: true,
    callHours: '9 AM – 5 PM',
    status: 'active',
    postedDaysAgo: 7,
    deadline: daysFromNow(23),
  });

  const forkliftJob = await createJob(westcoast, {
    title: 'Forklift Operator – Walk-in',
    trade: 'machine_operator',
    jobType: 'walk_in',
    payMin: 700,
    payPeriod: 'day',
    openings: 10,
    benefits: ['overtime'],
    responsibilities: ['Move cargo in the container yard'],
    walkIn: {
      date: daysFromNow(3).toISOString().slice(0, 10),
      time: '09:00',
      endTime: '13:00',
      address: 'Gate 2, Paradip Port',
      contactPerson: 'Sunita Rath',
      bring: 'Aadhaar copy, 2 photos',
    },
    siteName: 'Container Yard',
    status: 'active',
    postedDaysAgo: 2,
  });

  const shipWelderJob = await createJob(westcoast, {
    title: 'Welder – Ship Repair',
    trade: 'welder',
    shift: 'rotational',
    payMin: 20000,
    payMax: 24000,
    payType: 'in_hand',
    openings: 3,
    experience: '3_5',
    qualifications: ['ITI'],
    benefits: ['transport', 'overtime', 'hazard_pay'],
    responsibilities: ['Hull and deck repair welding', 'Work at height with a harness'],
    requirements: ['ITI Welder certificate', 'Not afraid of heights'],
    siteName: 'Ship Repair Yard',
    status: 'active',
    postedDaysAgo: 3,
    deadline: daysFromNow(27),
  });

  const trailerJob = await createJob(westcoast, {
    title: 'Trailer Driver (HMV)',
    trade: 'driver',
    sector: 'logistics',
    payMin: 22000,
    payMax: 26000,
    payType: 'in_hand',
    openings: 4,
    experience: '3_5',
    licences: ['HMV'],
    benefits: ['food', 'overtime'],
    responsibilities: ['Drive container trailers between the port and the yard'],
    requirements: ['Valid HMV licence', '3 years trailer driving'],
    status: 'active',
    postedDaysAgo: 12,
    deadline: daysFromNow(18),
  });

  const dumperJob = await createJob(angul, {
    title: 'Dumper Operator (HMV)',
    trade: 'driver',
    shift: 'rotational',
    workHours: '8 hours, rotating shifts',
    payMin: 24000,
    payMax: 28000,
    payType: 'in_hand',
    openings: 6,
    experience: '3_5',
    licences: ['HMV'],
    benefits: ['food', 'stay', 'hazard_pay'],
    responsibilities: ['Operate a 35-tonne dumper inside the mine', 'Follow the mine haul road rules'],
    requirements: ['Valid HMV licence', 'Dumper or tipper experience'],
    siteName: 'Pit 2',
    allowCalls: true,
    callHours: '9 AM – 5 PM',
    status: 'active',
    postedDaysAgo: 8,
    deadline: daysFromNow(22),
  });

  const substationJob = await createJob(angul, {
    title: 'Electrician – Mine Substation',
    trade: 'electrician',
    payMin: 25000,
    payMax: 30000,
    payType: 'in_hand',
    openings: 1,
    experience: '5_plus',
    qualifications: ['ITI'],
    licences: ['Wireman licence'],
    benefits: ['stay', 'pf_esi', 'hazard_pay'],
    responsibilities: ['Maintain the 33 kV mine substation', 'Keep the shift log'],
    requirements: ['5 years with HT panels'],
    siteName: 'Mine Substation',
    status: 'closed',
    postedDaysAgo: 32,
  });

  await createJob(angul, {
    title: 'Mining Helper – 6 Month Contract',
    trade: 'helper',
    jobType: 'contract',
    contractLength: '6 months',
    payMin: 600,
    payPeriod: 'day',
    openings: 15,
    benefits: ['food', 'transport'],
    responsibilities: ['Help the blasting and loading teams', 'Keep haul roads clear'],
    requirements: ['18 to 45 years', 'Fit for outdoor work'],
    siteName: 'Pit 2',
    status: 'active',
    postedDaysAgo: 4,
    deadline: daysFromNow(10),
  });

  await createJob(kalinganagar, {
    title: 'Welder – Steel Plant (Contract)',
    trade: 'welder',
    jobType: 'contract',
    contractLength: '11 months',
    payMin: 16000,
    payMax: 18000,
    openings: 20,
    experience: '1_2',
    qualifications: ['ITI'],
    benefits: ['stay'],
    responsibilities: ['Welding work at a steel plant in Kalinganagar'],
    status: 'draft',
  });

  // ── Applications, one at every stage ──

  // Interview coming up. Ramesh confirmed he will attend.
  const rameshApp = await createApplication({
    job: welderJob,
    company: konark,
    worker: ramesh,
    appliedDaysAgo: 8,
    steps: [
      { type: 'viewed', daysAgo: 6 },
      { type: 'shortlisted', daysAgo: 5 },
      { type: 'interview', daysAgo: 4 },
    ],
    interview: {
      at: dayAt(2, 10),
      place: 'Konark Heavy Engineering, Main Gate Workshop',
      contactPerson: 'Pradeep Mohanty',
      bring: 'Aadhaar, ITI certificate',
      attending: true,
    },
  });
  await createChat(
    rameshApp,
    konark,
    ramesh,
    5,
    [
      ['hr', 4, 'Hello Ramesh, your interview is fixed. The date and time are in your application.'],
      ['worker', 3.95, 'Thank you sir. I will come on time.'],
      ['worker', 3.9, 'Should I bring my own gloves and safety shoes?'],
      ['hr', 3.5, 'Not needed. There will be a small welding test and we give all safety items.'],
      ['hr', 0.2, 'Please come to the Main Gate Workshop and ask for me at the reception.'],
    ],
    { worker: 3.5, hr: 3.6 },
  );

  // Shortlisted yesterday. HR asked a question, Bijay answered, HR has not read it yet.
  const bijayApp = await createApplication({
    job: fitterJob,
    company: konark,
    worker: bijay,
    appliedDaysAgo: 3,
    steps: [
      { type: 'viewed', daysAgo: 2 },
      { type: 'shortlisted', daysAgo: 2 },
    ],
  });
  await createChat(
    bijayApp,
    konark,
    bijay,
    2,
    [
      ['hr', 1, 'Hi Bijay, we liked your profile. Have you done structural fabrication work before?'],
      ['worker', 0.9, 'Yes sir, 4 years at a fabrication yard in Rourkela. I can read drawings.'],
    ],
    { worker: 0.95, hr: 1 },
  );

  // Not selected: wants day shift only, the post is nights. The note is private to HR.
  await createApplication({
    job: securityJob,
    company: konark,
    worker: deepak,
    appliedDaysAgo: 12,
    steps: [
      { type: 'viewed', daysAgo: 11 },
      { type: 'rejected', daysAgo: 10, note: 'Wants day shift only; this post is nights.', isPrivate: true },
    ],
    rejectionNote: 'Wants day shift only; this post is nights.',
  });

  // Offer sent, waiting for Sanjay's reply.
  const sanjayApp = await createApplication({
    job: craneJob,
    company: westcoast,
    worker: sanjay,
    appliedDaysAgo: 6,
    steps: [
      { type: 'viewed', daysAgo: 5 },
      { type: 'shortlisted', daysAgo: 5 },
      { type: 'interview', daysAgo: 4 },
      { type: 'offer', daysAgo: 1 },
    ],
    interview: {
      at: dayAt(-2, 11),
      place: 'Westcoast Ports & Logistics, Port Road office',
      contactPerson: 'Sunita Rath',
      bring: 'HMV licence, Aadhaar',
      attending: true,
    },
    offer: {
      pay: 32000,
      joiningDate: daysFromNow(10),
      place: 'Berth 4, Paradip Port',
      note: 'Rotating shifts. Company bus from Paradip bus stand.',
    },
  });
  await createChat(
    sanjayApp,
    westcoast,
    sanjay,
    5,
    [
      ['hr', 4, 'Sanjay, the interview is at our Port Road office. Please carry your HMV licence.'],
      ['worker', 3.9, 'Okay madam, I will be there.'],
      ['hr', 1, 'We have sent you the offer. Please accept it in the app if the salary is fine.'],
      ['worker', 0.5, 'Thank you madam. Is a room given near the port?'],
      ['hr', 0.4, 'No room, but the company bus picks up from Paradip bus stand.'],
    ],
    { worker: 0.45, hr: 0.45 },
  );

  // Hired two weeks ago.
  const prakashApp = await createApplication({
    job: substationJob,
    company: angul,
    worker: prakash,
    appliedDaysAgo: 30,
    steps: [
      { type: 'viewed', daysAgo: 29 },
      { type: 'shortlisted', daysAgo: 28 },
      { type: 'interview', daysAgo: 27 },
      { type: 'offer', daysAgo: 22 },
      { type: 'hired', daysAgo: 14 },
    ],
    interview: {
      at: dayAt(-25, 10),
      place: 'Angul Mineral Works, Site Office',
      contactPerson: 'Bikash Pradhan',
      bring: 'Wireman licence, ITI certificate',
      attending: true,
    },
    offer: { pay: 28000, joiningDate: daysAgo(14), place: 'Mine Substation, Talcher', accepted: true },
  });
  await createChat(
    prakashApp,
    angul,
    prakash,
    28,
    [
      ['hr', 27, 'Prakash ji, please bring your wireman licence to the interview.'],
      ['worker', 26.9, 'Yes sir, I will bring it.'],
      ['hr', 15, 'Welcome to the team. Report at the site office at 8 AM tomorrow for the safety briefing.'],
      ['worker', 14.9, 'Thank you sir, I will be there.'],
    ],
    { worker: 14.9, hr: 14.8 },
  );

  // Interview tomorrow.
  const arjunApp = await createApplication({
    job: dumperJob,
    company: angul,
    worker: arjun,
    appliedDaysAgo: 6,
    steps: [
      { type: 'viewed', daysAgo: 5 },
      { type: 'shortlisted', daysAgo: 5 },
      { type: 'interview', daysAgo: 4 },
    ],
    interview: {
      at: dayAt(1, 9),
      place: 'Angul Mineral Works, Site Office',
      contactPerson: 'Bikash Pradhan',
      bring: 'HMV licence, Aadhaar',
    },
  });
  await createChat(
    arjunApp,
    angul,
    arjun,
    5,
    [
      ['hr', 4, 'Arjun, there will be a short driving test at Pit 2 after the interview.'],
      ['worker', 3.8, 'Okay sir. Which gate should I use?'],
      ['hr', 3.7, 'Use the Balanda Road gate and show this message to the guard.'],
    ],
    { worker: 3.7, hr: 3.8 },
  );

  // Withdrew after the HR said the work is outside Odisha (see the job report below).
  await createApplication({
    job: trailerJob,
    company: westcoast,
    worker: arjun,
    appliedDaysAgo: 9,
    steps: [
      { type: 'viewed', daysAgo: 8 },
      { type: 'withdrawn', daysAgo: 7 },
    ],
  });

  // New applicants, not opened yet / just opened.
  await createApplication({
    job: forkliftJob,
    company: westcoast,
    worker: sasmita,
    appliedDaysAgo: 1,
    steps: [],
  });
  await createApplication({
    job: shipWelderJob,
    company: westcoast,
    worker: ramesh,
    appliedDaysAgo: 2,
    steps: [{ type: 'viewed', daysAgo: 1 }],
  });

  await prisma.savedJob.createMany({
    data: [
      { workerId: ramesh.id, jobId: craneJob.id, createdAt: daysAgo(3) },
      { workerId: sasmita.id, jobId: shipWelderJob.id, createdAt: daysAgo(1) },
      { workerId: bijay.id, jobId: welderJob.id, createdAt: daysAgo(4) },
    ],
  });

  // ── Admin: reports, help requests and the activity log ──
  await prisma.jobReport.create({
    data: {
      jobId: trailerJob.id,
      reporterId: arjun.id,
      reason: 'wrong_details',
      details: 'The job says Paradip, but on the phone they said the work is in Haldia, West Bengal.',
      createdAt: daysAgo(7),
    },
  });

  await prisma.supportTicket.createMany({
    data: [
      {
        userId: pooja.id,
        name: pooja.name,
        contact: '9822233344',
        role: 'worker',
        topic: 'Other',
        message: 'How do I add my ITI certificate? The photo from my phone does not upload.',
        createdAt: daysAgo(0.5),
      },
      {
        userId: kalinganagar.hr.id,
        name: kalinganagar.hr.name,
        contact: 'hr@kalinganagar.demo',
        role: 'employer',
        topic: 'Company verification',
        message: 'We signed up two days ago. How long does company approval take?',
        createdAt: daysAgo(1),
      },
      {
        name: 'Rabindra Jena',
        contact: '9861012345',
        role: 'guest',
        topic: 'Someone asked me for money',
        message:
          'A man called and said he will get me a job at the port for ₹5,000. Is he from IndustriaLink?',
        status: 'closed',
        closedAt: daysAgo(9),
        createdAt: daysAgo(10),
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        actorId: admin.id,
        action: 'company.approve',
        targetType: 'company',
        targetId: konark.id,
        createdAt: daysAgo(110),
      },
      {
        actorId: admin.id,
        action: 'company.approve',
        targetType: 'company',
        targetId: westcoast.id,
        createdAt: daysAgo(80),
      },
      {
        actorId: admin.id,
        action: 'company.approve',
        targetType: 'company',
        targetId: angul.id,
        createdAt: daysAgo(60),
      },
      {
        actorId: admin.id,
        action: 'user.block',
        targetType: 'user',
        targetId: manoj.id,
        details: { reason: 'Asked other workers for money to get them jobs.' },
        createdAt: daysAgo(20),
      },
    ],
  });

  const counts = {
    users: await prisma.user.count(),
    companies: await prisma.company.count(),
    jobs: await prisma.job.count(),
    applications: await prisma.application.count(),
    chats: await prisma.conversation.count(),
    messages: await prisma.message.count(),
    notifications: await prisma.notification.count(),
  };
  console.warn('Seeded demo data:', counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
