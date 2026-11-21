import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import {
  adminUser,
  app,
  authHeader,
  createEmployer,
  createJobInDb,
  createWorker,
  uniqueWord,
} from './helpers.js';

let admin: { Authorization: string };

beforeAll(async () => {
  admin = await authHeader(await adminUser());
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('admin jobs', () => {
  it('lists published and closed jobs, not drafts', async () => {
    const word = uniqueWord();
    const { company } = await createEmployer({ verification: 'approved' });
    await createJobInDb(company.id, { title: `${word} live` });
    await createJobInDb(company.id, { title: `${word} draft`, status: 'draft' });

    const res = await request(app).get(`/api/v1/admin/jobs?q=${word}`).set(admin);
    expect(res.status).toBe(200);
    expect(res.body.map((job: { title: string }) => job.title)).toEqual([`${word} live`]);
    expect(res.body[0]).toMatchObject({ companyStatus: 'active', companyName: company.name });
  });

  it('removes a job: closed, hidden from search, company told, action logged', async () => {
    const word = uniqueWord();
    const { company, user } = await createEmployer({ verification: 'approved' });
    const job = await createJobInDb(company.id, { title: `${word} scam` });

    const noReason = await request(app).post(`/api/v1/admin/jobs/${job.id}/remove`).set(admin).send({});
    expect(noReason.status).toBe(422);

    const res = await request(app)
      .post(`/api/v1/admin/jobs/${job.id}/remove`)
      .set(admin)
      .send({ reason: 'Asks workers for money' });
    expect(res.status).toBe(200);

    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after).toMatchObject({
      status: 'closed',
      removedByAdmin: true,
      removedReason: 'Asks workers for money',
    });
    expect(
      await prisma.notification.count({ where: { userId: user.id, title: 'Job removed by IndustriaLink' } }),
    ).toBe(1);
    expect(await prisma.auditLog.count({ where: { targetId: job.id, action: 'job.remove' } })).toBe(1);

    const worker = await authHeader(await createWorker());
    const found = await request(app).get(`/api/v1/jobs?q=${word}`).set(worker);
    expect(found.body.total).toBe(0);

    const again = await request(app)
      .post(`/api/v1/admin/jobs/${job.id}/remove`)
      .set(admin)
      .send({ reason: 'Again' });
    expect(again.status).toBe(409);
  });
});
