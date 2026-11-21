import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import type { User } from '../src/generated/prisma/client.js';

export const app = createApp();

const randomDigits = (count: number) =>
  Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join('');

/** A fresh worker with an empty profile, so tests don't depend on each other. */
export function createWorker(name = 'Test Worker') {
  return prisma.user.create({
    data: {
      role: 'worker',
      name,
      phone: `+919${randomDigits(9)}`,
      settings: { create: {} },
      workerProfile: { create: {} },
    },
  });
}

/** A fresh employer with its own company. */
export async function createEmployer(company: { verification?: 'pending' | 'approved' | 'rejected' } = {}) {
  const tag = randomDigits(8);
  const created = await prisma.company.create({
    data: {
      name: `Test Company ${tag}`,
      sector: 'metals',
      city: 'Cuttack',
      state: 'Odisha',
      verification: company.verification ?? 'pending',
      members: {
        create: {
          role: 'employer',
          name: 'Test HR',
          email: `hr-${tag}@test.demo`,
          status: 'pending',
          settings: { create: {} },
        },
      },
    },
    include: { members: true },
  });
  return { company: created, user: created.members[0]! };
}

export async function adminUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: 'admin@industrialink.demo' } });
}

/** Logs in through dev login and returns the Authorization header. */
export async function authHeader(user: User) {
  const res = await request(app).post('/api/v1/auth/dev-login').send({ userId: user.id });
  if (res.status !== 200) throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { Authorization: `Bearer ${res.body.token}` };
}

/** Smallest valid files, for upload tests. */
export const samplePdf = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
export const samplePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
export const samplePngDataUrl = `data:image/png;base64,${samplePng.toString('base64')}`;

/** Path + query of a signed file link, so supertest can fetch it. */
export const pathOf = (url: string) => {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
};

/** A short random word, to find only the jobs a test created. */
export const uniqueWord = () => `zq${randomDigits(8)}`;

/** A job form that is ready to publish. */
export const jobInput = (overrides: Record<string, unknown> = {}) => ({
  title: 'Welder (ITI)',
  trade: 'welder',
  sector: 'metals',
  location: { city: 'Rourkela', state: 'Odisha' },
  payMin: 18000,
  payMax: 22000,
  payPeriod: 'month',
  openings: 4,
  qualifications: ['ITI'],
  benefits: ['food', 'stay'],
  status: 'active',
  ...overrides,
});

/** Creates a job straight in the database (for cases the API would refuse). */
export function createJobInDb(companyId: string, data: Record<string, unknown> = {}) {
  return prisma.job.create({
    data: {
      companyId,
      title: 'Test job',
      trade: 'helper',
      sector: 'metals',
      city: 'Cuttack',
      state: 'Odisha',
      payMin: 15000,
      status: 'active',
      postedAt: new Date(),
      ...data,
    },
  });
}
