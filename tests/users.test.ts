import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { hashPassword } from '../src/lib/password.js';
import { createAdminAccount } from '../src/modules/users/user.service.js';
import { adminUser, app, authHeader, createEmployer, createWorker, uniqueWord } from './helpers.js';

let admin: { Authorization: string };

beforeAll(async () => {
  admin = await authHeader(await adminUser());
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('admin creates admins only from the server', () => {
  it('createAdminAccount makes an admin who can use admin pages', async () => {
    const created = await createAdminAccount({
      name: 'Second Admin',
      email: `${uniqueWord()}@industrialink.demo`,
      passwordHash: await hashPassword('a-strong-password'),
    });
    expect(created.role).toBe('admin');
    const res = await request(app)
      .get('/api/v1/admin/verifications')
      .set(await authHeader(created));
    expect(res.status).toBe(200);
  });

  it('there is no API to sign up as admin', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup/admin')
      .send({ name: 'Hacker', email: 'h@x.com', password: 'password123' });
    expect(res.status).toBe(404);
  });
});

describe('admin blocks and unblocks users', () => {
  it('blocking logs the user out at once; unblocking lets them log in again', async () => {
    const worker = await createWorker();
    const auth = await authHeader(worker);

    const block = await request(app)
      .patch(`/api/v1/admin/users/${worker.id}`)
      .set(admin)
      .send({ status: 'blocked' });
    expect(block.status).toBe(200);
    expect(block.body.status).toBe('blocked');
    expect((await request(app).get('/api/v1/auth/me').set(auth)).status).toBe(401); // session ended
    expect(await prisma.auditLog.count({ where: { targetId: worker.id, action: 'user.block' } })).toBe(1);

    const login = await request(app).post('/api/v1/auth/dev-login').send({ userId: worker.id });
    expect(login.status).toBe(403);

    await request(app).patch(`/api/v1/admin/users/${worker.id}`).set(admin).send({ status: 'active' });
    expect((await request(app).post('/api/v1/auth/dev-login').send({ userId: worker.id })).status).toBe(200);
  });

  it('saves the optional block reason in the activity log', async () => {
    const worker = await createWorker();
    await request(app)
      .patch(`/api/v1/admin/users/${worker.id}`)
      .set(admin)
      .send({ status: 'blocked', reason: 'Asked workers for money' })
      .expect(200);
    const entry = await prisma.auditLog.findFirst({ where: { targetId: worker.id, action: 'user.block' } });
    expect(entry?.details).toEqual({ reason: 'Asked workers for money' });
  });

  it("can't change an admin, and only admins can block", async () => {
    const other = await adminUser();
    expect(
      (await request(app).patch(`/api/v1/admin/users/${other.id}`).set(admin).send({ status: 'blocked' }))
        .status,
    ).toBe(403);

    const worker = await authHeader(await createWorker());
    const res = await request(app)
      .patch(`/api/v1/admin/users/${other.id}`)
      .set(worker)
      .send({ status: 'blocked' });
    expect(res.status).toBe(403);
  });

  it('HR users of a blocked company cannot use the app', async () => {
    const { company, user } = await createEmployer({ verification: 'approved' });
    const auth = await authHeader(user);
    await prisma.company.update({ where: { id: company.id }, data: { status: 'blocked' } });

    const me = await request(app).get('/api/v1/auth/me').set(auth);
    expect(me.status).toBe(403);
    expect(me.body.code).toBe('BLOCKED');
    expect((await request(app).post('/api/v1/auth/dev-login').send({ userId: user.id })).status).toBe(403);
  });
});
