import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { app, authHeader, createEmployer, createJobInDb, createWorker, jobInput } from './helpers.js';

let approved: { Authorization: string };
let approvedCompanyId: string;

beforeAll(async () => {
  const { company, user } = await createEmployer({ verification: 'approved' });
  approvedCompanyId = company.id;
  approved = await authHeader(user);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const create = (body: object, auth = approved) =>
  request(app).post('/api/v1/employer/jobs').set(auth).send(body);
const patch = (id: string, body: object) =>
  request(app).patch(`/api/v1/employer/jobs/${id}`).set(approved).send(body);

describe('company not approved yet', () => {
  it('can save drafts but not publish (403 NOT_VERIFIED)', async () => {
    const pending = await authHeader((await createEmployer()).user);

    const draft = await create(jobInput({ status: 'draft' }), pending);
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe('draft');

    const publish = await request(app)
      .patch(`/api/v1/employer/jobs/${draft.body.id}`)
      .set(pending)
      .send({ status: 'active' });
    expect(publish.status).toBe(403);
    expect(publish.body.code).toBe('NOT_VERIFIED');

    expect((await create(jobInput(), pending)).status).toBe(403);
  });
});

describe('creating and editing jobs', () => {
  it('publishes a job and returns it in the app shape', async () => {
    const res = await create(jobInput({ hrPhone: '98765 43210', allowCalls: true, deadline: '2099-12-31' }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      companyId: approvedCompanyId,
      companyVerified: true,
      title: 'Welder (ITI)',
      location: { city: 'Rourkela', state: 'Odisha' },
      status: 'active',
      hrPhone: '9876543210',
      deadline: '2099-12-31',
      payPeriod: 'month',
      shift: 'day',
      jobType: 'full_time',
      experience: 'fresher',
      applicantsCount: 0,
      newApplicantsCount: 0,
    });
    expect(res.body.postedAt).toEqual(expect.any(String));
  });

  it.each([
    [{ title: '' }, 'title'],
    [{ trade: 'astronaut' }, 'trade'],
    [{ payMin: 30000, payMax: 20000 }, 'Minimum pay'],
    [{ payMin: null, payMax: null }, 'pay range'],
    [{ location: { city: 'Rourkela', state: '' } }, 'state'],
    [{ jobType: 'walk_in' }, 'walk-in'],
    [{ deadline: '2020-01-01' }, 'last date'],
    [{ allowCalls: true }, 'HR number'],
    [{ status: 'closed' }, 'draft or published'],
  ])('rejects %j (422)', async (overrides, text) => {
    const res = await create(jobInput(overrides));
    expect(res.status).toBe(422);
    expect(res.body.message).toContain(text);
  });

  it('a walk-in job needs its walk-in details', async () => {
    const res = await create(
      jobInput({
        jobType: 'walk_in',
        walkIn: { date: '2099-01-10', time: '09:00', endTime: '13:00', address: 'Gate 2, Paradip Port' },
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.walkIn).toMatchObject({
      date: '2099-01-10',
      time: '09:00',
      address: 'Gate 2, Paradip Port',
    });
  });

  it('edits, closes and reopens a job', async () => {
    const { body: job } = await create(jobInput());
    const edited = await patch(job.id, { payMax: 25000, openings: 6 });
    expect(edited.body).toMatchObject({ payMin: 18000, payMax: 25000, openings: 6, status: 'active' });

    expect((await patch(job.id, { status: 'closed' })).body.status).toBe('closed');
    const reopened = await patch(job.id, { status: 'active' });
    expect(reopened.body.status).toBe('active');
    expect(reopened.body.postedAt).toBe(job.postedAt); // keeps its first posted date
  });

  it('lists own jobs, with a status filter', async () => {
    const { body: draft } = await create(jobInput({ status: 'draft', title: 'Draft for list' }));
    const all = await request(app).get('/api/v1/employer/jobs').set(approved);
    expect(all.body.some((job: { id: string }) => job.id === draft.id)).toBe(true);

    const active = await request(app).get('/api/v1/employer/jobs?status=active').set(approved);
    expect(active.body.every((job: { status: string }) => job.status === 'active')).toBe(true);
  });

  it("can't see or change another company's jobs (404)", async () => {
    const { body: job } = await create(jobInput());
    const other = await authHeader((await createEmployer({ verification: 'approved' })).user);
    expect((await request(app).get(`/api/v1/employer/jobs/${job.id}`).set(other)).status).toBe(404);
    expect((await request(app).patch(`/api/v1/employer/jobs/${job.id}`).set(other).send({})).status).toBe(
      404,
    );
    expect((await request(app).delete(`/api/v1/employer/jobs/${job.id}`).set(other)).status).toBe(404);
  });
});

describe('applicants and deleting', () => {
  it('counts applicants; a job with applicants is closed, not deleted', async () => {
    const { body: job } = await create(jobInput());
    const worker = await createWorker();
    const application = await prisma.application.create({ data: { jobId: job.id, workerId: worker.id } });

    const withNew = await request(app).get(`/api/v1/employer/jobs/${job.id}`).set(approved);
    expect(withNew.body).toMatchObject({ applicantsCount: 1, newApplicantsCount: 1 });

    await prisma.application.update({ where: { id: application.id }, data: { seenAt: new Date() } });
    const seen = await request(app).get(`/api/v1/employer/jobs/${job.id}`).set(approved);
    expect(seen.body).toMatchObject({ applicantsCount: 1, newApplicantsCount: 0 });

    const del = await request(app).delete(`/api/v1/employer/jobs/${job.id}`).set(approved);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('HAS_APPLICANTS');
    expect((await patch(job.id, { status: 'draft' })).status).toBe(409);
  });

  it('deletes a job nobody applied to', async () => {
    const { body: job } = await create(jobInput({ status: 'draft' }));
    expect((await request(app).delete(`/api/v1/employer/jobs/${job.id}`).set(approved)).status).toBe(200);
    expect((await request(app).get(`/api/v1/employer/jobs/${job.id}`).set(approved)).status).toBe(404);
  });

  it('a job removed by an admin cannot be published again (403 REMOVED)', async () => {
    const job = await createJobInDb(approvedCompanyId, { status: 'closed', removedByAdmin: true });
    const res = await patch(job.id, { status: 'active' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('REMOVED');
  });
});
