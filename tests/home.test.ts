import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { adminUser, app, authHeader, createEmployer, createJobInDb, createWorker } from './helpers.js';

const API = '/api/v1';
const DAY = 24 * 60 * 60 * 1000;

async function approvedEmployer() {
  const employer = await createEmployer({ verification: 'approved' });
  await prisma.user.update({ where: { id: employer.user.id }, data: { status: 'active' } });
  return employer;
}

describe('GET /worker/summary', () => {
  it('counts applications, interviews and saved jobs, and shows the next interview', async () => {
    const { company } = await approvedEmployer();
    const worker = await createWorker();
    const [jobA, jobB, jobC] = await Promise.all([
      createJobInDb(company.id, { title: 'Welder' }),
      createJobInDb(company.id, { title: 'Fitter' }),
      createJobInDb(company.id, { title: 'Driver' }),
    ]);
    const interviewAt = new Date(Date.now() + 2 * DAY);
    await prisma.application.create({
      data: {
        jobId: jobA.id,
        workerId: worker.id,
        stage: 'interview',
        interview: { create: { at: interviewAt, place: 'Gate 1' } },
      },
    });
    await prisma.application.create({ data: { jobId: jobB.id, workerId: worker.id } });
    await prisma.application.create({ data: { jobId: jobC.id, workerId: worker.id, stage: 'rejected' } });
    await prisma.savedJob.create({ data: { workerId: worker.id, jobId: jobC.id } });

    const res = await request(app)
      .get(`${API}/worker/summary`)
      .set(await authHeader(worker));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activeApplications: 2, interviews: 1, saved: 1 });
    expect(res.body.nextStep).toMatchObject({
      title: 'Interview',
      at: interviewAt.toISOString(),
      subtitle: expect.stringContaining('Welder'),
    });
  });

  it('a new worker sees an empty profile and what to add first', async () => {
    const res = await request(app)
      .get(`${API}/worker/summary`)
      .set(await authHeader(await createWorker()));
    expect(res.body).toMatchObject({ activeApplications: 0, interviews: 0, saved: 0, profileStrength: 0 });
    expect(res.body.missing.length).toBeGreaterThan(0);
    expect(res.body.profileHint).toBe(res.body.missing[0].label);
    expect(res.body.nextStep).toBeUndefined();
  });

  it('is only for workers', async () => {
    const { user } = await approvedEmployer();
    expect(
      (
        await request(app)
          .get(`${API}/worker/summary`)
          .set(await authHeader(user))
      ).status,
    ).toBe(403);
  });
});

describe('GET /employer/summary', () => {
  it('counts jobs and applicants and lists things to do', async () => {
    const { company, user } = await approvedEmployer();
    const job = await createJobInDb(company.id, {
      title: 'Crane operator',
      deadline: new Date(Date.now() + DAY),
    });
    await createJobInDb(company.id, { title: 'Helper draft', status: 'draft', postedAt: null });

    const [w1, w2, w3] = await Promise.all([createWorker(), createWorker(), createWorker()]);
    await prisma.application.create({ data: { jobId: job.id, workerId: w1.id } });
    await prisma.application.create({
      data: {
        jobId: job.id,
        workerId: w2.id,
        stage: 'interview',
        seenAt: new Date(),
        interview: { create: { at: new Date(Date.now() + 2 * DAY), place: 'Gate', response: 'cant_attend' } },
      },
    });
    await prisma.application.create({
      data: {
        jobId: job.id,
        workerId: w3.id,
        stage: 'hired',
        seenAt: new Date(),
        events: { create: { type: 'hired' } },
      },
    });

    const res = await request(app)
      .get(`${API}/employer/summary`)
      .set(await authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      openJobs: 1,
      newApplicants: 1,
      interviewsThisWeek: 1,
      hiredThisMonth: 1,
    });
    expect(res.body.funnel).toEqual([
      { stage: 'Applied', count: 3 },
      { stage: 'Shortlisted', count: 2 },
      { stage: 'Interview', count: 2 },
      { stage: 'Hired', count: 1 },
    ]);
    expect(res.body.applicantsPerDay).toHaveLength(7);
    expect(res.body.applicantsPerDay.at(-1).count).toBe(3);

    const actions = res.body.attention.map((item: { action: string }) => item.action);
    expect(actions).toEqual(['Review', 'New time', 'Extend', 'Finish']);
  });

  it('an empty company gets zeros, not errors', async () => {
    const { user } = await createEmployer();
    const res = await request(app)
      .get(`${API}/employer/summary`)
      .set(await authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ openJobs: 0, newApplicants: 0, attention: [] });
  });
});

describe('GET /admin/summary', () => {
  it('returns platform counts, things to do and a 6-week chart', async () => {
    const before = await request(app)
      .get(`${API}/admin/summary`)
      .set(await authHeader(await adminUser()));
    await createEmployer(); // a new company waiting for approval
    await createWorker();

    const res = await request(app)
      .get(`${API}/admin/summary`)
      .set(await authHeader(await adminUser()));
    expect(res.status).toBe(200);
    expect(res.body.workers).toBe(before.body.workers + 1);
    expect(res.body.companies).toBe(before.body.companies + 1);
    expect(res.body.pendingVerifications).toBe(before.body.pendingVerifications + 1);
    expect(res.body.attention.some((item: { id: string }) => item.id === 'pc')).toBe(true);
    expect(res.body.signupsPerWeek).toHaveLength(6);
    expect(res.body.signupsPerWeek.at(-1).workers).toBeGreaterThan(0);
  });

  it('is only for admins', async () => {
    expect(
      (
        await request(app)
          .get(`${API}/admin/summary`)
          .set(await authHeader(await createWorker()))
      ).status,
    ).toBe(403);
  });
});
