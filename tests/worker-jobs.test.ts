import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import type { User } from '../src/generated/prisma/client.js';
import { app, authHeader, createEmployer, createJobInDb, createWorker, uniqueWord } from './helpers.js';

let worker: User;
let auth: { Authorization: string };
let companyId: string;

beforeAll(async () => {
  worker = await createWorker();
  auth = await authHeader(worker);
  companyId = (await createEmployer({ verification: 'approved' })).company.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const search = (query: string, headers: Record<string, string> = auth) =>
  request(app).get(`/api/v1/jobs?${query}`).set(headers);
const titles = (res: request.Response) => res.body.items.map((job: { title: string }) => job.title);

describe('GET /jobs (search)', () => {
  it('shows only open jobs from verified companies', async () => {
    const word = uniqueWord();
    const pendingCompany = (await createEmployer()).company.id;
    await createJobInDb(companyId, { title: `${word} open` });
    await createJobInDb(companyId, { title: `${word} draft`, status: 'draft' });
    await createJobInDb(companyId, { title: `${word} closed`, status: 'closed' });
    await createJobInDb(companyId, { title: `${word} expired`, deadline: new Date('2020-01-01') });
    await createJobInDb(companyId, { title: `${word} removed`, removedByAdmin: true });
    await createJobInDb(pendingCompany, { title: `${word} unverified company` });

    const res = await search(`q=${word}`);
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual([`${word} open`]);
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 10 });
  });

  it('every word must match; qualifications count too', async () => {
    const word = uniqueWord();
    await createJobInDb(companyId, { title: `${word} Fitter`, city: 'Angul', qualifications: ['ITI'] });
    await createJobInDb(companyId, { title: `${word} Helper`, city: 'Puri' });
    expect(titles(await search(`q=${word} angul`))).toEqual([`${word} Fitter`]);
    expect(titles(await search(`q=${word} iti`))).toEqual([`${word} Fitter`]);
  });

  it('filters by trade, city, shift, food/stay and walk-in', async () => {
    const word = uniqueWord();
    await createJobInDb(companyId, { title: `${word} A`, trade: 'driver', city: 'Jajpur', shift: 'night' });
    await createJobInDb(companyId, {
      title: `${word} B`,
      trade: 'welder',
      benefits: ['stay'],
      jobType: 'walk_in',
    });
    expect(titles(await search(`q=${word}&trade=driver`))).toEqual([`${word} A`]);
    expect(titles(await search(`q=${word}&city=jajpur`))).toEqual([`${word} A`]);
    expect(titles(await search(`q=${word}&shift=night`))).toEqual([`${word} A`]);
    expect(titles(await search(`q=${word}&foodStay=true`))).toEqual([`${word} B`]);
    expect(titles(await search(`q=${word}&walkInOnly=true`))).toEqual([`${word} B`]);
  });

  it('minimum pay counts daily pay as 26 days a month', async () => {
    const word = uniqueWord();
    await createJobInDb(companyId, { title: `${word} daily`, payMin: 700, payPeriod: 'day' }); // 18,200/month
    await createJobInDb(companyId, { title: `${word} low`, payMin: 12000, payMax: 15000 });
    expect(titles(await search(`q=${word}&minPay=18000`))).toEqual([`${word} daily`]);
  });

  it('sorts by pay; jobs without pay always come last', async () => {
    const word = uniqueWord();
    await createJobInDb(companyId, { title: `${word} no pay`, payMin: null, postedAt: new Date() });
    await createJobInDb(companyId, { title: `${word} 20k`, payMin: 20000 });
    await createJobInDb(companyId, { title: `${word} 30k`, payMax: 30000, payMin: null });
    expect(titles(await search(`q=${word}&sort=pay`))).toEqual([
      `${word} 30k`,
      `${word} 20k`,
      `${word} no pay`,
    ]);
    expect(titles(await search(`q=${word}`)).at(-1)).toBe(`${word} no pay`);
  });

  it('pages through results, 10 at a time', async () => {
    const word = uniqueWord();
    for (let i = 0; i < 12; i++) await createJobInDb(companyId, { title: `${word} ${i}` });
    const second = await search(`q=${word}&page=2`);
    expect(second.body).toMatchObject({ total: 12, page: 2 });
    expect(second.body.items).toHaveLength(2);
  });

  it('rejects an unknown filter value (422) and is only for workers (403)', async () => {
    expect((await search('trade=astronaut')).status).toBe(422);
    const employer = await authHeader((await createEmployer()).user);
    expect((await search('', employer)).status).toBe(403);
  });
});

describe('job page, saving and applying status', () => {
  it('never sends the HR number to workers', async () => {
    const job = await createJobInDb(companyId, { hrPhone: '+919000011111', allowCalls: true });
    const res = await request(app).get(`/api/v1/jobs/${job.id}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('hrPhone');
    expect(res.body).toMatchObject({ id: job.id, saved: false, allowCalls: true });
  });

  it('closed jobs still open; drafts and bad ids are 404', async () => {
    const closed = await createJobInDb(companyId, { status: 'closed' });
    const draft = await createJobInDb(companyId, { status: 'draft' });
    expect((await request(app).get(`/api/v1/jobs/${closed.id}`).set(auth)).body.status).toBe('closed');
    expect((await request(app).get(`/api/v1/jobs/${draft.id}`).set(auth)).status).toBe(404);
    expect((await request(app).get('/api/v1/jobs/123').set(auth)).status).toBe(404);
  });

  it('saves and unsaves a job', async () => {
    const job = await createJobInDb(companyId, { title: 'Saved test job' });
    expect((await request(app).post(`/api/v1/jobs/${job.id}/save`).set(auth)).body).toEqual({ saved: true });
    expect((await request(app).post(`/api/v1/jobs/${job.id}/save`).set(auth)).body).toEqual({ saved: true }); // twice is fine

    const saved = await request(app).get('/api/v1/worker/saved').set(auth);
    expect(saved.body.map((item: { id: string }) => item.id)).toContain(job.id);
    expect((await request(app).get(`/api/v1/jobs/${job.id}`).set(auth)).body.saved).toBe(true);

    expect((await request(app).delete(`/api/v1/jobs/${job.id}/save`).set(auth)).body).toEqual({
      saved: false,
    });
    const after = await request(app).get('/api/v1/worker/saved').set(auth);
    expect(after.body.map((item: { id: string }) => item.id)).not.toContain(job.id);
  });

  it('shows which jobs the worker already applied to', async () => {
    const job = await createJobInDb(companyId);
    const application = await prisma.application.create({ data: { jobId: job.id, workerId: worker.id } });
    const res = await request(app).get(`/api/v1/jobs/${job.id}`).set(auth);
    expect(res.body.appliedApplicationId).toBe(application.id);
  });
});

describe('public job pages (no login)', () => {
  it('search and job page work without login and hide the HR number', async () => {
    const word = uniqueWord();
    const job = await createJobInDb(companyId, { title: `${word} public`, hrPhone: '+919000022222' });
    const list = await request(app).get(`/api/v1/public/jobs?q=${word}`);
    expect(list.status).toBe(200);
    expect(list.body.items[0]).toMatchObject({ id: job.id, saved: false });

    const page = await request(app).get(`/api/v1/public/jobs/${job.id}`);
    expect(page.status).toBe(200);
    expect(page.body).not.toHaveProperty('hrPhone');
  });
});

describe('companies for workers', () => {
  it('lists verified companies with open job counts, without private fields', async () => {
    const { company } = await createEmployer({ verification: 'approved' });
    await prisma.company.update({
      where: { id: company.id },
      data: { gstNumber: '21AAACB0000A1Z5', hrPhone: '+919000033333' },
    });
    await createJobInDb(company.id);
    await createJobInDb(company.id, { status: 'draft' });
    const pending = (await createEmployer()).company;

    const res = await request(app)
      .get(`/api/v1/companies?q=${encodeURIComponent(company.name)}`)
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].openJobs).toBe(1);
    expect(res.body[0].company).not.toHaveProperty('gstNumber');
    expect(res.body[0].company).not.toHaveProperty('hrPhone');

    const page = await request(app).get(`/api/v1/companies/${company.id}`).set(auth);
    expect(page.body.company.id).toBe(company.id);
    expect(page.body.jobs).toHaveLength(1);
    expect(page.body.jobs[0]).not.toHaveProperty('hrPhone');

    expect((await request(app).get(`/api/v1/companies/${pending.id}`).set(auth)).status).toBe(404);
  });
});
