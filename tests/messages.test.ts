import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { cleanMessageText } from '../src/modules/messages/message.schemas.js';
import { adminUser, app, authHeader, createEmployer, createJobInDb, createWorker } from './helpers.js';

const API = '/api/v1';
type Auth = { Authorization: string };

/** A worker who applied to a company's job. The chat opens once HR shortlists them. */
async function application() {
  const { company, user: hrUser } = await createEmployer({ verification: 'approved' });
  await prisma.user.update({ where: { id: hrUser.id }, data: { status: 'active' } });
  const job = await createJobInDb(company.id, { title: 'Fitter' });
  const workerUser = await createWorker('Ravi Kumar');
  const worker = await authHeader(workerUser);
  const hr = await authHeader(hrUser);

  await request(app).post(`${API}/jobs/${job.id}/apply`).set(worker).send({}).expect(201);
  const { id } = await prisma.application.findFirstOrThrow({
    where: { jobId: job.id, workerId: workerUser.id },
  });

  const moveTo = (stage: string) =>
    request(app).patch(`${API}/employer/applications/${id}`).set(hr).send({ stage }).expect(200);
  return { id, job, company, workerUser, hrUser, worker, hr, moveTo };
}

/** An application that is already shortlisted, so both sides can write. */
async function openChat() {
  const chat = await application();
  await chat.moveTo('shortlisted');
  return chat;
}

const inbox = (auth: Auth) => request(app).get(`${API}/messages`).set(auth);
const thread = (auth: Auth, id: string, query = '') =>
  request(app).get(`${API}/messages/${id}${query}`).set(auth);
const send = (auth: Auth, id: string, body: object) =>
  request(app).post(`${API}/messages/${id}`).set(auth).send(body);
const threadIn = async (auth: Auth, id: string) =>
  (await inbox(auth)).body.find((t: { applicationId: string }) => t.applicationId === id);

describe('when the chat opens', () => {
  it('is closed before shortlisting, and opens at shortlisting for both sides', async () => {
    const chat = await application();

    const early = await send(chat.hr, chat.id, { text: 'Hello' });
    expect(early.status).toBe(403);
    expect(early.body.code).toBe('NOT_ALLOWED');
    expect((await thread(chat.worker, chat.id)).body.code).toBe('NOT_ALLOWED');
    expect(await threadIn(chat.worker, chat.id)).toBeUndefined();

    await chat.moveTo('shortlisted');

    expect(await threadIn(chat.worker, chat.id)).toEqual({
      applicationId: chat.id,
      jobTitle: 'Fitter',
      companyName: chat.company.name,
      workerName: 'Ravi Kumar',
      otherName: `HR · ${chat.company.name}`,
      stage: 'shortlisted',
      unread: 0,
      canSend: true,
    });
    expect(await threadIn(chat.hr, chat.id)).toMatchObject({ otherName: 'Ravi Kumar', canSend: true });
    // The worker can write first too.
    expect((await send(chat.worker, chat.id, { text: 'Thank you!' })).status).toBe(201);
  });

  it('stays open from interview to hired, and the same chat is kept', async () => {
    const chat = await openChat();
    await send(chat.hr, chat.id, { text: 'Welcome' }).expect(201);
    await prisma.application.update({ where: { id: chat.id }, data: { stage: 'hired' } });

    const opened = await thread(chat.worker, chat.id);
    expect(opened.body.thread).toMatchObject({ stage: 'hired', canSend: true });
    expect(opened.body.messages).toHaveLength(1);
    expect(await prisma.conversation.count({ where: { applicationId: chat.id } })).toBe(1);
  });
});

describe('who can see a chat', () => {
  it('other workers and other companies get 404, admins get 403', async () => {
    const chat = await openChat();
    const otherWorker = await authHeader(await createWorker());
    const otherHr = await authHeader((await createEmployer({ verification: 'approved' })).user);
    const admin = await authHeader(await adminUser());

    for (const outsider of [otherWorker, otherHr]) {
      expect((await thread(outsider, chat.id)).status).toBe(404);
      expect((await send(outsider, chat.id, { text: 'Hi' })).status).toBe(404);
      expect(await threadIn(outsider, chat.id)).toBeUndefined();
    }
    expect((await inbox(admin)).status).toBe(403);
    expect((await thread(admin, chat.id)).status).toBe(403);
  });

  it('an unknown or broken id is 404', async () => {
    const { worker } = await openChat();
    expect((await thread(worker, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await thread(worker, 'not-an-id')).status).toBe(404);
  });

  it('a second HR user of the company shares the chat and its unread count', async () => {
    const chat = await openChat();
    const secondHr = await prisma.user.create({
      data: { role: 'employer', name: 'Second HR', companyId: chat.company.id, settings: { create: {} } },
    });
    const second = await authHeader(secondHr);

    await send(chat.worker, chat.id, { text: 'Hello' }).expect(201);
    expect((await threadIn(chat.hr, chat.id)).unread).toBe(1);

    await thread(second, chat.id).expect(200);
    expect((await threadIn(chat.hr, chat.id)).unread).toBe(0);
  });
});

describe('unread counts and seen ticks', () => {
  it('counts new messages until the chat is opened', async () => {
    const chat = await openChat();
    for (const text of ['One', 'Two', 'Three']) await send(chat.hr, chat.id, { text }).expect(201);

    expect(await threadIn(chat.worker, chat.id)).toMatchObject({ unread: 3, lastMessage: 'Three' });
    // The sender's own messages are never unread for them.
    expect((await threadIn(chat.hr, chat.id)).unread).toBe(0);

    const before = await thread(chat.hr, chat.id);
    expect(before.body.messages.map((m: { seen: boolean }) => m.seen)).toEqual([false, false, false]);

    const opened = await thread(chat.worker, chat.id);
    expect(opened.body.thread.unread).toBe(0);
    expect(opened.body.messages.map((m: { text: string }) => m.text)).toEqual(['One', 'Two', 'Three']);
    // `seen` is only on your own messages.
    expect(opened.body.messages[0].seen).toBeUndefined();
    expect(opened.body.messages[0]).toMatchObject({ fromRole: 'employer', fromUserId: chat.hrUser.id });

    const after = await thread(chat.hr, chat.id);
    expect(after.body.messages.map((m: { seen: boolean }) => m.seen)).toEqual([true, true, true]);
    expect((await threadIn(chat.worker, chat.id)).unread).toBe(0);
  });

  it('POST /read clears the count without loading messages', async () => {
    const chat = await openChat();
    await send(chat.worker, chat.id, { text: 'Hi' }).expect(201);
    const res = await request(app).post(`${API}/messages/${chat.id}/read`).set(chat.hr);
    expect(res.body).toEqual({ ok: true });
    expect((await threadIn(chat.hr, chat.id)).unread).toBe(0);
  });

  it('replying counts as reading', async () => {
    const chat = await openChat();
    await send(chat.hr, chat.id, { text: 'Can you come tomorrow?' }).expect(201);
    await send(chat.worker, chat.id, { text: 'Yes' }).expect(201);
    expect((await threadIn(chat.worker, chat.id)).unread).toBe(0);
    expect((await thread(chat.hr, chat.id)).body.messages[0].seen).toBe(true);
  });

  it('the inbox shows the newest chat first, with a one-line preview', async () => {
    const first = await openChat();
    const second = await application();
    // Same worker in both chats.
    await prisma.application.update({ where: { id: second.id }, data: { workerId: first.workerUser.id } });
    await second.moveTo('shortlisted');

    await send(second.hr, second.id, { text: 'Older' }).expect(201);
    await send(first.hr, first.id, { text: `Line one\nline two ${'x'.repeat(200)}` }).expect(201);

    const list = (await inbox(first.worker)).body;
    expect(list.map((t: { applicationId: string }) => t.applicationId)).toEqual([first.id, second.id]);
    expect(list[0].lastMessage).toMatch(/^Line one line two x+…$/);
    expect(list[0].lastMessage).toHaveLength(120);
  });
});

describe('sending', () => {
  it('returns the message as the apps expect it', async () => {
    const chat = await openChat();
    const res = await send(chat.worker, chat.id, { text: '  Hello sir  ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      applicationId: chat.id,
      fromUserId: chat.workerUser.id,
      fromRole: 'worker',
      text: 'Hello sir',
      at: expect.any(String),
      seen: false,
    });
  });

  it('a retry with the same clientId is saved once', async () => {
    const chat = await openChat();
    const body = { text: 'Are you there?', clientId: 'phone-abc-1' };
    const first = await send(chat.worker, chat.id, body);
    const retry = await send(chat.worker, chat.id, body);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.clientId).toBe('phone-abc-1');
    expect(await prisma.message.count({ where: { applicationId: chat.id } })).toBe(1);
    expect((await threadIn(chat.hr, chat.id)).unread).toBe(1);

    // Two copies at the same moment are still saved once.
    const together = await Promise.all(
      [1, 2].map(() => send(chat.worker, chat.id, { ...body, clientId: 'same-time' })),
    );
    expect(new Set(together.map((res) => res.body.id)).size).toBe(1);
    expect(await prisma.message.count({ where: { applicationId: chat.id } })).toBe(2);
  });

  it('a clientId used in another chat is refused', async () => {
    const one = await openChat();
    await send(one.worker, one.id, { text: 'Hi', clientId: 'reused' }).expect(201);
    const two = await application();
    await prisma.application.update({ where: { id: two.id }, data: { workerId: one.workerUser.id } });
    await two.moveTo('shortlisted');
    const res = await send(one.worker, two.id, { text: 'Hi', clientId: 'reused' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CLIENT_ID_USED');
  });

  it('checks the text', async () => {
    const chat = await openChat();
    expect((await send(chat.worker, chat.id, {})).status).toBe(422);
    expect((await send(chat.worker, chat.id, { text: '   \n ' })).status).toBe(422);
    expect((await send(chat.worker, chat.id, { text: 'a'.repeat(1001) })).status).toBe(422);
    expect((await send(chat.worker, chat.id, { text: 'a'.repeat(1000) })).status).toBe(201);
    expect((await send(chat.worker, chat.id, { text: 'Hi', clientId: 'has space' })).status).toBe(422);
  });

  it('removes hidden characters but keeps line breaks', () => {
    expect(cleanMessageText('Pay\u200B here\u202E')).toBe('Pay here');
    expect(cleanMessageText('a\u0000b\u0007c')).toBe('abc');
    expect(cleanMessageText('one\r\ntwo\tthree')).toBe('one\ntwo three');
    expect(cleanMessageText(`a${'\n'.repeat(30)}b`)).toBe(`a${'\n'.repeat(10)}b`);
    expect(cleanMessageText('नमस्ते 🙏')).toBe('नमस्ते 🙏');
  });

  it('allows 20 messages a minute per person', async () => {
    const chat = await openChat();
    for (let i = 1; i <= 20; i++) await send(chat.hr, chat.id, { text: `Message ${i}` }).expect(201);
    const tooFast = await send(chat.hr, chat.id, { text: 'One more' });
    expect(tooFast.status).toBe(429);
    expect(tooFast.body.code).toBe('TOO_MANY_REQUESTS');
    // The other side has its own limit.
    expect((await send(chat.worker, chat.id, { text: 'Hi' })).status).toBe(201);
  });
});

describe('read-only chats', () => {
  const expectReadOnly = async (auth: Auth, id: string, code = 'NOT_ALLOWED') => {
    const opened = await thread(auth, id);
    expect(opened.status).toBe(200);
    expect(opened.body.thread.canSend).toBe(false);
    const res = await send(auth, id, { text: 'Hello?' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(code);
  };

  it('rejecting closes it (history stays); shortlisting again opens it', async () => {
    const chat = await openChat();
    await send(chat.hr, chat.id, { text: 'Hello' }).expect(201);
    await chat.moveTo('rejected');

    await expectReadOnly(chat.worker, chat.id);
    await expectReadOnly(chat.hr, chat.id);
    expect((await thread(chat.worker, chat.id)).body.messages).toHaveLength(1);
    expect((await threadIn(chat.worker, chat.id)).stage).toBe('rejected');

    await chat.moveTo('shortlisted');
    expect((await send(chat.hr, chat.id, { text: 'Good news' })).status).toBe(201);
  });

  it('withdrawing closes it', async () => {
    const chat = await openChat();
    await request(app).post(`${API}/worker/applications/${chat.id}/withdraw`).set(chat.worker).expect(200);
    await expectReadOnly(chat.hr, chat.id);
  });

  it('a job removed by the admin closes it', async () => {
    const chat = await openChat();
    const admin = await authHeader(await adminUser());
    await request(app)
      .post(`${API}/admin/jobs/${chat.job.id}/remove`)
      .set(admin)
      .send({ reason: 'Fake job' })
      .expect(200);
    await expectReadOnly(chat.worker, chat.id);
  });

  it('a blocked worker or a blocked company closes it for the other side', async () => {
    const chat = await openChat();
    await prisma.user.update({ where: { id: chat.workerUser.id }, data: { status: 'blocked' } });
    await expectReadOnly(chat.hr, chat.id);

    const other = await openChat();
    await prisma.company.update({ where: { id: other.company.id }, data: { status: 'blocked' } });
    await expectReadOnly(other.worker, other.id);
  });

  it('messaging turned off by the admin: reading works, sending is refused', async () => {
    const chat = await openChat();
    await prisma.platformSettings.update({ where: { id: 1 }, data: { messagingEnabled: false } });
    try {
      await expectReadOnly(chat.worker, chat.id, 'DISABLED');
      expect((await threadIn(chat.worker, chat.id)).canSend).toBe(false);
    } finally {
      await prisma.platformSettings.update({ where: { id: 1 }, data: { messagingEnabled: true } });
    }
  });
});

describe('long chats load in pages', () => {
  it('newest 50 first, then older with ?before, new ones with ?after', async () => {
    const chat = await openChat();
    const start = Date.now() - 1000 * 60 * 60;
    await prisma.message.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({
        applicationId: chat.id,
        senderId: chat.hrUser.id,
        senderRole: 'employer' as const,
        text: `#${i + 1}`,
        createdAt: new Date(start + i * 1000),
      })),
    });
    const texts = (res: request.Response) => res.body.messages.map((m: { text: string }) => m.text);

    const newest = await thread(chat.worker, chat.id);
    expect(newest.body.hasMore).toBe(true);
    expect(texts(newest)).toHaveLength(50);
    expect(texts(newest)[0]).toBe('#71');
    expect(texts(newest)[49]).toBe('#120');

    const older = await thread(chat.worker, chat.id, `?before=${newest.body.messages[0].id}`);
    expect(texts(older)[0]).toBe('#21');
    expect(texts(older)[49]).toBe('#70');
    expect(older.body.hasMore).toBe(true);

    const oldest = await thread(chat.worker, chat.id, `?before=${older.body.messages[0].id}`);
    expect(texts(oldest)).toHaveLength(20);
    expect(texts(oldest)[0]).toBe('#1');
    expect(oldest.body.hasMore).toBe(false);

    const sinceLast = newest.body.messages[49].id;
    expect(texts(await thread(chat.worker, chat.id, `?after=${sinceLast}`))).toEqual([]);
    await send(chat.hr, chat.id, { text: 'New one' }).expect(201);
    const caughtUp = await thread(chat.worker, chat.id, `?after=${sinceLast}`);
    expect(texts(caughtUp)).toEqual(['New one']);
    expect(caughtUp.body.hasMore).toBe(false);
    // "What's new" doesn't count as opening the chat.
    expect(caughtUp.body.thread.unread).toBe(1);
  });

  it('refuses a cursor from another chat, or both cursors at once', async () => {
    const one = await openChat();
    const two = await openChat();
    const { body } = await send(two.hr, two.id, { text: 'Elsewhere' });

    const wrong = await thread(one.worker, one.id, `?before=${body.id}`);
    expect(wrong.status).toBe(422);
    expect(wrong.body.code).toBe('BAD_CURSOR');
    expect((await thread(one.worker, one.id, `?before=${body.id}&after=${body.id}`)).status).toBe(422);
  });
});
