import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { adminUser, app, authHeader, createEmployer, createJobInDb, createWorker } from './helpers.js';

const API = '/api/v1';
let admin: { Authorization: string };
let adminId: string;

beforeAll(async () => {
  const user = await adminUser();
  adminId = user.id;
  admin = await authHeader(user);
});

async function reportedJob() {
  const { company } = await createEmployer({ verification: 'approved' });
  const job = await createJobInDb(company.id, { title: 'Pay fee job' });
  const worker = await createWorker('Sanjay Nayak');
  const auth = await authHeader(worker);
  return { job, worker, auth, companyName: company.name };
}

const myReport = (jobId: string) =>
  request(app)
    .get(`${API}/admin/reports?status=all`)
    .set(admin)
    .then((res) => res.body.filter((r: { jobId: string }) => r.jobId === jobId));

describe('worker reports a job', () => {
  it('saves the report and tells the admins', async () => {
    const { job, auth, companyName } = await reportedJob();
    const res = await request(app)
      .post(`${API}/jobs/${job.id}/report`)
      .set(auth)
      .send({ reason: 'asks_money', details: 'Asked for Rs 2000' });
    expect(res.status).toBe(201);

    const [row] = await myReport(job.id);
    expect(row).toMatchObject({
      jobTitle: 'Pay fee job',
      companyName,
      reporterName: 'Sanjay Nayak',
      reason: 'asks_money',
      details: 'Asked for Rs 2000',
      status: 'open',
      jobStatus: 'active',
      reportsForJob: 1,
    });
    expect(
      await prisma.notification.count({ where: { userId: adminId, title: 'Job reported' } }),
    ).toBeGreaterThan(0);
  });

  it('needs a reason, and details for "other"; a second report is refused', async () => {
    const { job, auth } = await reportedJob();
    const url = `${API}/jobs/${job.id}/report`;
    expect((await request(app).post(url).set(auth).send({})).status).toBe(422);
    expect((await request(app).post(url).set(auth).send({ reason: 'other' })).status).toBe(422);

    await request(app).post(url).set(auth).send({ reason: 'fake' }).expect(201);
    const again = await request(app).post(url).set(auth).send({ reason: 'fake' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_REPORTED');
  });

  it('employers cannot report', async () => {
    const { job } = await reportedJob();
    const hr = await createEmployer({ verification: 'approved' });
    const res = await request(app)
      .post(`${API}/jobs/${job.id}/report`)
      .set(await authHeader(hr.user))
      .send({ reason: 'fake' });
    expect(res.status).toBe(403);
  });
});

describe('admin handles reports', () => {
  it('dismiss closes only that report', async () => {
    const { job, auth } = await reportedJob();
    await request(app).post(`${API}/jobs/${job.id}/report`).set(auth).send({ reason: 'fake' });
    const [row] = await myReport(job.id);

    const res = await request(app)
      .post(`${API}/admin/reports/${row.id}`)
      .set(admin)
      .send({ action: 'dismiss' });
    expect(res.body).toEqual({ ok: true });
    const [after] = await myReport(job.id);
    expect(after).toMatchObject({ status: 'dismissed', resolvedBy: expect.any(String), jobStatus: 'active' });

    const twice = await request(app)
      .post(`${API}/admin/reports/${row.id}`)
      .set(admin)
      .send({ action: 'dismiss' });
    expect(twice.body.code).toBe('ALREADY_DONE');
  });

  it('remove_job closes the job and every open report for it', async () => {
    const { job, auth } = await reportedJob();
    const other = await authHeader(await createWorker());
    await request(app).post(`${API}/jobs/${job.id}/report`).set(auth).send({ reason: 'asks_money' });
    await request(app).post(`${API}/jobs/${job.id}/report`).set(other).send({ reason: 'unsafe' });
    const [first] = await myReport(job.id);
    expect(first.reportsForJob).toBe(2);

    await request(app)
      .post(`${API}/admin/reports/${first.id}`)
      .set(admin)
      .send({ action: 'remove_job', note: 'Asks for money' })
      .expect(200);

    const rows = await myReport(job.id);
    expect(rows.map((r: { status: string }) => r.status)).toEqual(['job_removed', 'job_removed']);
    const stored = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored).toMatchObject({ status: 'closed', removedByAdmin: true, removedReason: 'Asks for money' });
  });

  it('filters by status and is only for admins', async () => {
    const open = await request(app).get(`${API}/admin/reports`).set(admin);
    expect(open.body.every((r: { status: string }) => r.status === 'open')).toBe(true);
    const worker = await authHeader(await createWorker());
    expect((await request(app).get(`${API}/admin/reports`).set(worker)).status).toBe(403);
  });
});
