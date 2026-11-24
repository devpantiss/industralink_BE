import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { adminUser, app, authHeader, createWorker } from './helpers.js';

const API = '/api/v1/admin';
let admin: { Authorization: string };

beforeAll(async () => {
  admin = await authHeader(await adminUser());
});

afterAll(async () => {
  // Other test files expect the defaults.
  await prisma.platformSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: { autoApproveCompanies: false, messagingEnabled: true, talentSearchEnabled: true },
  });
});

describe('platform settings', () => {
  it('reads and changes the switches; each change is logged', async () => {
    const before = await request(app).get(`${API}/settings`).set(admin);
    expect(before.body).toEqual({
      autoApproveCompanies: false,
      messagingEnabled: true,
      talentSearchEnabled: true,
    });

    const res = await request(app).patch(`${API}/settings`).set(admin).send({ messagingEnabled: false });
    expect(res.body.messagingEnabled).toBe(false);

    const log = await request(app).get(`${API}/audit`).set(admin);
    expect(log.body[0]).toMatchObject({
      action: 'Turned off setting',
      target: 'Messaging',
      actor: expect.any(String),
    });

    // Sending the same value again changes nothing and logs nothing.
    await request(app).patch(`${API}/settings`).set(admin).send({ messagingEnabled: false });
    const again = await request(app).get(`${API}/audit`).set(admin);
    expect(again.body[0].id).toBe(log.body[0].id);

    // Switch it back at once: other test files run at the same time.
    await request(app).patch(`${API}/settings`).set(admin).send({ messagingEnabled: true });
  });

  it('refuses values that are not true / false', async () => {
    const res = await request(app).patch(`${API}/settings`).set(admin).send({ talentSearchEnabled: 'yes' });
    expect(res.status).toBe(422);
  });
});

describe('activity log', () => {
  it('shows readable entries with names', async () => {
    const worker = await createWorker('Log Target');
    await request(app)
      .patch(`${API}/users/${worker.id}`)
      .set(admin)
      .send({ status: 'blocked', reason: 'Spam' });

    const log = await request(app).get(`${API}/audit`).set(admin);
    expect(log.body[0]).toMatchObject({ action: 'Blocked user', target: 'Log Target – Spam' });
  });

  it('is only for admins', async () => {
    const worker = await authHeader(await createWorker());
    expect((await request(app).get(`${API}/audit`).set(worker)).status).toBe(403);
    expect((await request(app).get(`${API}/settings`).set(worker)).status).toBe(403);
  });
});
