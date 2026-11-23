import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { adminUser, app, authHeader, createEmployer, createJobInDb, createWorker } from './helpers.js';

const API = '/api/v1/admin';
let auth: { Authorization: string };

beforeAll(async () => {
  auth = await authHeader(await adminUser());
});

describe('GET /admin/users', () => {
  it('lists workers with phone and city, and finds them by name or phone', async () => {
    const worker = await createWorker('Sukant Behera');
    await prisma.workerProfile.update({ where: { userId: worker.id }, data: { city: 'Talcher' } });

    const res = await request(app).get(`${API}/users?role=worker&q=sukant`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: worker.id,
      role: 'worker',
      name: 'Sukant Behera',
      contact: `+91 ${worker.phone!.slice(3)}`,
      city: 'Talcher',
      status: 'active',
    });

    const byPhone = await request(app)
      .get(`${API}/users?role=worker&q=${worker.phone!.slice(5)}`)
      .set(auth);
    expect(byPhone.body.map((row: { id: string }) => row.id)).toContain(worker.id);
  });

  it('lists employers by company name with verification', async () => {
    const { company, user } = await createEmployer();
    const res = await request(app)
      .get(`${API}/users?role=employer&q=${encodeURIComponent(company.name)}`)
      .set(auth);
    expect(res.body).toEqual([
      expect.objectContaining({
        id: user.id,
        role: 'employer',
        name: company.name,
        contact: user.email,
        city: 'Cuttack',
        verification: 'pending',
      }),
    ]);
  });

  it('filters by status (a blocked company counts as blocked)', async () => {
    const { company, user } = await createEmployer();
    await prisma.company.update({ where: { id: company.id }, data: { status: 'blocked' } });

    const blocked = await request(app).get(`${API}/users?role=employer&status=blocked`).set(auth);
    const row = blocked.body.find((item: { id: string }) => item.id === user.id);
    expect(row?.status).toBe('blocked');

    const active = await request(app).get(`${API}/users?role=employer&status=pending`).set(auth);
    expect(active.body.some((item: { id: string }) => item.id === user.id)).toBe(false);
  });

  it('is only for admins', async () => {
    expect(
      (
        await request(app)
          .get(`${API}/users`)
          .set(await authHeader(await createWorker()))
      ).status,
    ).toBe(403);
  });
});

describe('GET /admin/user-impact/:id', () => {
  it("counts the employer's active jobs and their applicants", async () => {
    const { company, user } = await createEmployer({ verification: 'approved' });
    const job = await createJobInDb(company.id);
    await createJobInDb(company.id, { status: 'closed' });
    await prisma.application.create({ data: { jobId: job.id, workerId: (await createWorker()).id } });

    const res = await request(app).get(`${API}/user-impact/${user.id}`).set(auth);
    expect(res.body).toEqual({ activeJobs: 1, applicants: 1 });
  });

  it('a worker has nothing to lose', async () => {
    const res = await request(app)
      .get(`${API}/user-impact/${(await createWorker()).id}`)
      .set(auth);
    expect(res.body).toEqual({ activeJobs: 0, applicants: 0 });
  });
});
