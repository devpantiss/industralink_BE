import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import {
  adminUser,
  app,
  authHeader,
  createEmployer,
  createJobInDb,
  createWorker,
  samplePdf,
} from './helpers.js';

const API = '/api/v1';
const remove = (auth: { Authorization: string }, body: object = { confirm: 'DELETE' }) =>
  request(app).post(`${API}/me/delete`).set(auth).send(body);

describe('POST /me/delete', () => {
  it('worker: personal data erased, open applications withdrawn, login ends', async () => {
    const { company } = await createEmployer({ verification: 'approved' });
    const job = await createJobInDb(company.id);
    const worker = await createWorker('Ramesh Sahu');
    const auth = await authHeader(worker);

    await prisma.workerProfile.update({
      where: { userId: worker.id },
      data: { city: 'Angul', about: 'Welder', skills: ['MIG'], dob: new Date('1995-01-01') },
    });
    await request(app)
      .post(`${API}/worker/documents`)
      .set(auth)
      .field('type', 'resume')
      .attach('file', samplePdf, 'cv.pdf');
    await request(app).post(`${API}/jobs/${job.id}/apply`).set(auth).send({}).expect(201);

    expect((await remove(auth, { confirm: 'yes' })).status).toBe(422);
    expect((await remove(auth)).body).toEqual({ ok: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: worker.id } });
    expect(user).toMatchObject({ name: 'Deleted user', phone: null, email: null });
    expect(user.deletedAt).not.toBeNull();

    const profile = await prisma.workerProfile.findUniqueOrThrow({ where: { userId: worker.id } });
    expect(profile).toMatchObject({ city: null, about: null, skills: [], dob: null });
    expect(await prisma.workerDocument.count({ where: { workerId: worker.id } })).toBe(0);

    const application = await prisma.application.findFirstOrThrow({ where: { workerId: worker.id } });
    expect(application.stage).toBe('withdrawn');

    // The old login stops working, and the account no longer shows for admins.
    expect((await request(app).get(`${API}/auth/me`).set(auth)).status).toBe(401);
    const admin = await authHeader(await adminUser());
    const users = await request(app).get(`${API}/admin/users?role=worker`).set(admin);
    expect(users.body.some((row: { id: string }) => row.id === worker.id)).toBe(false);
  });

  it('employer: open jobs close and the company is hidden', async () => {
    const { company, user } = await createEmployer({ verification: 'approved' });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'active' } });
    const job = await createJobInDb(company.id);
    const auth = await authHeader(user);

    await remove(auth).expect(200);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('closed');
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).status).toBe('blocked');
  });

  it('admins cannot delete themselves here', async () => {
    const res = await remove(await authHeader(await adminUser()));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN');
  });
});
