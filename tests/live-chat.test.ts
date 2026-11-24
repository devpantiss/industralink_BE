import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { prisma } from '../src/db/prisma.js';
import { attachLiveServer, checkConnections } from '../src/realtime/live-server.js';
import { adminUser, app, authHeader, createEmployer, createJobInDb, createWorker } from './helpers.js';

const API = '/api/v1';
type Auth = { Authorization: string };
type LiveEvent = { type: string; [key: string]: unknown };

let server: Server;
let live: ReturnType<typeof attachLiveServer>;
let wsUrl: string;

beforeAll(async () => {
  server = createServer(app);
  live = attachLiveServer(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});

afterAll(async () => {
  live.close();
  await new Promise((resolve) => server.close(resolve));
});

/** A live connection that records every event and how it closed. */
function connect(options: { autoPong?: boolean } = {}) {
  const socket = new WebSocket(wsUrl, options);
  const events: LiveEvent[] = [];
  const waiters: { match: (e: LiveEvent) => boolean; resolve: (e: LiveEvent) => void }[] = [];
  const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));

  socket.on('message', (data) => {
    const event = JSON.parse(data.toString()) as LiveEvent;
    events.push(event);
    for (const waiter of [...waiters]) {
      if (waiter.match(event)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(event);
      }
    }
  });

  /** The next event of this type (or one already received), within 3 s. */
  const next = (type: string, match: (e: LiveEvent) => boolean = () => true) => {
    const seen = events.find((e) => e.type === type && match(e));
    if (seen) return Promise.resolve(seen);
    return new Promise<LiveEvent>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No "${type}" event`)), 3000);
      waiters.push({
        match: (e) => e.type === type && match(e),
        resolve: (e) => {
          clearTimeout(timer);
          resolve(e);
        },
      });
    });
  };

  const opened = new Promise<void>((resolve) => socket.on('open', () => resolve()));
  const sendJson = async (value: object) => {
    await opened;
    socket.send(JSON.stringify(value));
  };
  return { socket, events, next, closed, sendJson };
}

/** Connects and logs in with the user's token. */
async function connectAs(auth: Auth, options: { autoPong?: boolean } = {}) {
  const client = connect(options);
  await client.sendJson({ type: 'auth', token: auth.Authorization.slice('Bearer '.length) });
  await client.next('ready');
  return client;
}

/** A shortlisted application, so the chat is open. */
async function openChat() {
  const { company, user: hrUser } = await createEmployer({ verification: 'approved' });
  await prisma.user.update({ where: { id: hrUser.id }, data: { status: 'active' } });
  const job = await createJobInDb(company.id);
  const workerUser = await createWorker('Live Worker');
  const worker = await authHeader(workerUser);
  const hr = await authHeader(hrUser);
  await request(app).post(`${API}/jobs/${job.id}/apply`).set(worker).send({}).expect(201);
  const { id } = await prisma.application.findFirstOrThrow({
    where: { jobId: job.id, workerId: workerUser.id },
  });
  await request(app)
    .patch(`${API}/employer/applications/${id}`)
    .set(hr)
    .send({ stage: 'shortlisted' })
    .expect(200);
  return { id, workerUser, hrUser, worker, hr };
}

const quietFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('logging in to the live connection', () => {
  it('a valid token gets "ready"', async () => {
    const { worker } = await openChat();
    const client = await connectAs(worker);
    expect(client.events[0]).toEqual({ type: 'ready' });
    client.socket.close();
  });

  it('anything before the login, or a wrong token, is closed with 4001', async () => {
    const early = connect();
    await early.sendJson({ type: 'typing', applicationId: '00000000-0000-4000-8000-000000000000' });
    expect(await early.closed).toBe(4001);

    const wrong = connect();
    await wrong.sendJson({ type: 'auth', token: 'not-a-token' });
    expect(await wrong.closed).toBe(4001);
  });

  it('admins are closed with 4003', async () => {
    const client = connect();
    const admin = await authHeader(await adminUser());
    await client.sendJson({ type: 'auth', token: admin.Authorization.slice(7) });
    expect(await client.closed).toBe(4003);
  });

  it('a browser page from another site is refused; our dashboard is allowed', async () => {
    const other = new WebSocket(wsUrl, { headers: { Origin: 'https://other-site.example' } });
    const error = await new Promise<Error>((resolve) => other.on('error', resolve));
    expect(error.message).toContain('401');

    const ours = new WebSocket(wsUrl, { headers: { Origin: 'http://localhost:5173' } });
    await new Promise((resolve) => ours.on('open', resolve));
    ours.close();
  });
});

describe('chat events', () => {
  it('a new message reaches both sides, each with their own view', async () => {
    const chat = await openChat();
    const workerLive = await connectAs(chat.worker);
    const hrLive = await connectAs(chat.hr);

    await request(app)
      .post(`${API}/messages/${chat.id}`)
      .set(chat.hr)
      .send({ text: 'Come at 9', clientId: 'c-1' });

    const toWorker = (await workerLive.next('message:new')).message as Record<string, unknown>;
    const toHr = (await hrLive.next('message:new')).message as Record<string, unknown>;
    expect(toWorker).toMatchObject({ applicationId: chat.id, text: 'Come at 9', fromRole: 'employer' });
    expect(toWorker.seen).toBeUndefined();
    expect(toWorker.clientId).toBeUndefined();
    expect(toHr).toMatchObject({ id: toWorker.id, seen: false, clientId: 'c-1' });

    // A retry of the same message sends no second event.
    await request(app)
      .post(`${API}/messages/${chat.id}`)
      .set(chat.hr)
      .send({ text: 'Come at 9', clientId: 'c-1' });
    await quietFor(200);
    expect(workerLive.events.filter((e) => e.type === 'message:new')).toHaveLength(1);

    workerLive.socket.close();
    hrLive.socket.close();
  });

  it('opening the chat tells the other side it was seen', async () => {
    const chat = await openChat();
    const hrLive = await connectAs(chat.hr);
    await request(app).post(`${API}/messages/${chat.id}`).set(chat.hr).send({ text: 'Hello' });

    await request(app).get(`${API}/messages/${chat.id}`).set(chat.worker).expect(200);
    const read = await hrLive.next('chat:read');
    expect(read).toMatchObject({ applicationId: chat.id, side: 'worker', at: expect.any(String) });

    // Opening again with nothing new sends nothing.
    await request(app).get(`${API}/messages/${chat.id}`).set(chat.worker).expect(200);
    await quietFor(200);
    expect(hrLive.events.filter((e) => e.type === 'chat:read' && e.side === 'worker')).toHaveLength(1);
    hrLive.socket.close();
  });

  it('typing is shown to the other side only, and not too often', async () => {
    const chat = await openChat();
    const workerLive = await connectAs(chat.worker);
    const hrLive = await connectAs(chat.hr);

    await workerLive.sendJson({ type: 'typing', applicationId: chat.id });
    await workerLive.sendJson({ type: 'typing', applicationId: chat.id });
    expect(await hrLive.next('chat:typing')).toEqual({
      type: 'chat:typing',
      applicationId: chat.id,
      side: 'worker',
    });
    await quietFor(200);
    expect(hrLive.events.filter((e) => e.type === 'chat:typing')).toHaveLength(1);
    expect(workerLive.events.some((e) => e.type === 'chat:typing')).toBe(false);

    workerLive.socket.close();
    hrLive.socket.close();
  });

  it("typing in someone else's chat is ignored", async () => {
    const chat = await openChat();
    const hrLive = await connectAs(chat.hr);
    const outsider = await connectAs(await authHeader(await createWorker()));
    await outsider.sendJson({ type: 'typing', applicationId: chat.id });
    await quietFor(300);
    expect(hrLive.events.some((e) => e.type === 'chat:typing')).toBe(false);
    hrLive.socket.close();
    outsider.socket.close();
  });

  it('rejecting the worker tells both sides the chat changed', async () => {
    const chat = await openChat();
    const workerLive = await connectAs(chat.worker);
    await request(app)
      .patch(`${API}/employer/applications/${chat.id}`)
      .set(chat.hr)
      .send({ stage: 'rejected' })
      .expect(200);
    expect(await workerLive.next('chat:changed')).toEqual({ type: 'chat:changed', applicationId: chat.id });
    workerLive.socket.close();
  });

  it('turning messaging off tells everyone', async () => {
    const chat = await openChat();
    const workerLive = await connectAs(chat.worker);
    const admin = await authHeader(await adminUser());
    try {
      await request(app)
        .patch(`${API}/admin/settings`)
        .set(admin)
        .send({ messagingEnabled: false })
        .expect(200);
      expect(await workerLive.next('messaging:changed')).toEqual({
        type: 'messaging:changed',
        enabled: false,
      });
    } finally {
      await request(app).patch(`${API}/admin/settings`).set(admin).send({ messagingEnabled: true });
    }
    workerLive.socket.close();
  });
});

describe('the connection ends when the login ends', () => {
  it('logging out closes it', async () => {
    const { worker } = await openChat();
    const client = await connectAs(worker);
    await request(app).post(`${API}/auth/logout`).set(worker).expect(200);
    expect(await client.closed).toBe(4001);
  });

  it('blocking the user closes it', async () => {
    const { worker, workerUser } = await openChat();
    const client = await connectAs(worker);
    const admin = await authHeader(await adminUser());
    await request(app)
      .patch(`${API}/admin/users/${workerUser.id}`)
      .set(admin)
      .send({ status: 'blocked' })
      .expect(200);
    expect(await client.closed).toBe(4001);
  });

  it('the regular check closes a session that ended some other way', async () => {
    const { worker, workerUser } = await openChat();
    const client = await connectAs(worker);
    await prisma.session.updateMany({ where: { userId: workerUser.id }, data: { revokedAt: new Date() } });
    await checkConnections();
    expect(await client.closed).toBe(4001);
  });

  it('a connection that stops answering pings is dropped', async () => {
    const { worker } = await openChat();
    // Like a phone that lost its network: pings get no answer.
    const client = await connectAs(worker, { autoPong: false });
    await checkConnections();
    await quietFor(100);
    await checkConnections();
    expect(await client.closed).toBe(1006);
  });
});
