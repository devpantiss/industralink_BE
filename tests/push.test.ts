import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import type { User } from '../src/generated/prisma/client.js';
import { notify } from '../src/modules/notifications/notification.service.js';
import {
  type PushMessage,
  type PushTarget,
  pushIdle,
  setPushSender,
} from '../src/modules/push/push.service.js';
import { adminUser, app, authHeader, createEmployer, createJobInDb, createWorker } from './helpers.js';

const API = '/api/v1';
type Auth = { Authorization: string };

/** Records every push instead of sending it. Ids in `gone` act like removed apps. */
const sent: { tokens: string[]; message: PushMessage }[] = [];
const gone = new Set<string>();
setPushSender({
  async send(targets: PushTarget[], message: PushMessage) {
    sent.push({ tokens: targets.map((target) => target.token), message });
    return targets.map((target) => (gone.has(target.token) ? 'gone' : 'sent'));
  },
});

beforeEach(() => {
  sent.length = 0;
  gone.clear();
});

afterAll(async () => {
  setPushSender(null);
  await prisma.$disconnect();
});

let counter = 0;
const newToken = () => `fcm-test-token:${Date.now()}-${++counter}`;

const savePhone = (auth: Auth, body: object) => request(app).put(`${API}/me/push-token`).set(auth).send(body);

/** Logs the user in on a "phone" and registers its push token. */
async function phoneOf(user: User) {
  const auth = await authHeader(user);
  const token = newToken();
  await savePhone(auth, { token, platform: 'android' }).expect(204);
  return { auth, token };
}

/** Pushes that reached this token, after the background sending has finished. */
async function pushesTo(token: string) {
  await pushIdle();
  return sent.filter((push) => push.tokens.includes(token)).map((push) => push.message);
}

/** A shortlisted worker and an approved company's HR, both with a phone. */
async function chatWithPhones() {
  const { company, user: hrUser } = await createEmployer({ verification: 'approved' });
  await prisma.user.update({ where: { id: hrUser.id }, data: { status: 'active' } });
  const job = await createJobInDb(company.id, { title: 'Fitter' });
  const workerUser = await createWorker('Ravi Kumar');
  const worker = await phoneOf(workerUser);
  const hr = await phoneOf(hrUser);

  await request(app).post(`${API}/jobs/${job.id}/apply`).set(worker.auth).send({}).expect(201);
  const { id } = await prisma.application.findFirstOrThrow({ where: { jobId: job.id } });
  await request(app)
    .patch(`${API}/employer/applications/${id}`)
    .set(hr.auth)
    .send({ stage: 'shortlisted' })
    .expect(200);
  return { id, company, workerUser, hrUser, worker, hr };
}

describe('PUT /me/push-token', () => {
  it('saves one push token per login; a new one replaces the old', async () => {
    const user = await createWorker();
    const auth = await authHeader(user);
    const first = newToken();
    const second = newToken();

    await savePhone(auth, { token: first, platform: 'android' }).expect(204);
    await savePhone(auth, { token: second, platform: 'android', kind: 'fid' }).expect(204);

    const rows = await prisma.pushToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ token: second, kind: 'fid', platform: 'android' });
  });

  it('moves the token when the phone logs in to another account', async () => {
    const before = await phoneOf(await createWorker());
    const otherUser = await createWorker();

    await savePhone(await authHeader(otherUser), { token: before.token, platform: 'android' }).expect(204);

    const row = await prisma.pushToken.findUniqueOrThrow({ where: { token: before.token } });
    expect(row.userId).toBe(otherUser.id);
  });

  it('rejects a wrong token or platform, and needs a login', async () => {
    const auth = await authHeader(await createWorker());
    expect((await savePhone(auth, { token: 'bad token!', platform: 'android' })).status).toBe(422);
    expect((await savePhone(auth, { token: newToken(), platform: 'windows' })).status).toBe(422);
    expect((await savePhone(auth, {})).status).toBe(422);
    await request(app).put(`${API}/me/push-token`).send({ token: newToken(), platform: 'ios' }).expect(401);
  });

  it('DELETE turns pushes off for this login only', async () => {
    const user = await createWorker();
    const phone = await phoneOf(user);
    const tablet = await phoneOf(user);

    await request(app).delete(`${API}/me/push-token`).set(phone.auth).expect(204);

    const left = await prisma.pushToken.findMany({ where: { userId: user.id } });
    expect(left.map((row) => row.token)).toEqual([tablet.token]);
  });

  it('logout removes the token of that login', async () => {
    const phone = await phoneOf(await createWorker());
    await request(app).post(`${API}/auth/logout`).set(phone.auth).expect(200);
    expect(await prisma.pushToken.findUnique({ where: { token: phone.token } })).toBeNull();
  });
});

describe('pushes for bell notifications', () => {
  it('a hiring step reaches every phone of the worker, with the screen to open', async () => {
    const chat = await chatWithPhones();
    const secondPhone = await phoneOf(chat.workerUser);

    expect(await pushesTo(chat.worker.token)).toContainEqual({
      title: 'Application update',
      body: expect.stringMatching(/shortlisted/i),
      link: `/worker/applications/${chat.id}`,
      channel: 'updates',
    });
    expect(await pushesTo(secondPhone.token)).toEqual([]); // logged in after the step
  });

  it('is sent only after the change is saved (company approval)', async () => {
    const { company, user } = await createEmployer({ verification: 'pending' });
    const phone = await phoneOf(user);
    const admin = await authHeader(await adminUser());
    const decide = () =>
      request(app)
        .post(`${API}/admin/verifications/company/${company.id}`)
        .set(admin)
        .send({ decision: 'approve' });

    await decide().expect(200);
    expect(await pushesTo(phone.token)).toEqual([
      {
        title: 'Company verified ✓',
        body: 'You can now publish jobs.',
        link: '/employer/company',
        channel: 'updates',
      },
    ]);

    sent.length = 0;
    await decide().expect(409); // already decided: the transaction is undone
    expect(await pushesTo(phone.token)).toEqual([]);
  });

  it('never reaches blocked accounts or logins that ended', async () => {
    const blockedUser = await createWorker();
    const blocked = await phoneOf(blockedUser);
    await prisma.user.update({ where: { id: blockedUser.id }, data: { status: 'blocked' } });
    const loggedOutUser = await createWorker();
    const ended = await phoneOf(loggedOutUser);
    await prisma.session.updateMany({ where: { userId: loggedOutUser.id }, data: { revokedAt: new Date() } });

    await notify(
      [blockedUser, loggedOutUser].map((user) => ({ userId: user.id, title: 'Hello', body: 'Test' })),
    );

    expect(await pushesTo(blocked.token)).toEqual([]);
    expect(await pushesTo(ended.token)).toEqual([]);
  });

  it('forgets phones where the app was removed', async () => {
    const chat = await chatWithPhones();
    gone.add(chat.worker.token);

    await request(app)
      .post(`${API}/messages/${chat.id}`)
      .set(chat.hr.auth)
      .send({ text: 'Hello' })
      .expect(201);
    await pushIdle();

    expect(await prisma.pushToken.findUnique({ where: { token: chat.worker.token } })).toBeNull();
  });
});

describe('pushes for chat messages', () => {
  it('HR → worker: titled with the company, grouped per chat, not sent back to HR', async () => {
    const chat = await chatWithPhones();
    sent.length = 0;

    await request(app)
      .post(`${API}/messages/${chat.id}`)
      .set(chat.hr.auth)
      .send({ text: 'Please come at   10 am\nwith your ITI certificate.' })
      .expect(201);

    expect(await pushesTo(chat.worker.token)).toEqual([
      {
        title: chat.company.name,
        body: 'Please come at 10 am with your ITI certificate.',
        link: `/worker/messages?c=${chat.id}`,
        channel: 'messages',
        group: `chat-${chat.id}`,
      },
    ]);
    expect(await pushesTo(chat.hr.token)).toEqual([]);
  });

  it('worker → every HR user of the company, titled with the worker name', async () => {
    const chat = await chatWithPhones();
    sent.length = 0;

    await request(app)
      .post(`${API}/messages/${chat.id}`)
      .set(chat.worker.auth)
      .send({ text: 'I will come.' });

    expect(await pushesTo(chat.hr.token)).toEqual([
      expect.objectContaining({
        title: 'Ravi Kumar',
        body: 'I will come.',
        link: `/employer/messages?c=${chat.id}`,
      }),
    ]);
    expect(await pushesTo(chat.worker.token)).toEqual([]);
  });

  it('a retried message (same clientId) is pushed once', async () => {
    const chat = await chatWithPhones();
    sent.length = 0;
    const body = { text: 'On my way', clientId: crypto.randomUUID() };

    await request(app).post(`${API}/messages/${chat.id}`).set(chat.worker.auth).send(body).expect(201);
    await request(app).post(`${API}/messages/${chat.id}`).set(chat.worker.auth).send(body).expect(200);

    expect(await pushesTo(chat.hr.token)).toHaveLength(1);
  });
});
