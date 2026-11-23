import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { app, authHeader, createWorker } from './helpers.js';

const API = '/api/v1';

async function workerWithNotifications(count: number) {
  const worker = await createWorker();
  for (let i = 0; i < count; i++) {
    await prisma.notification.create({
      data: {
        userId: worker.id,
        title: `Note ${i}`,
        body: 'Body',
        createdAt: new Date(Date.now() - (count - i) * 1000),
      },
    });
  }
  return { worker, auth: await authHeader(worker) };
}

describe('notifications', () => {
  it('lists the newest 30, newest first', async () => {
    const { auth } = await workerWithNotifications(32);
    const res = await request(app).get(`${API}/notifications`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(30);
    expect(res.body[0]).toMatchObject({ title: 'Note 31', read: false, at: expect.any(String) });
  });

  it('marks one and then all as read', async () => {
    const { auth } = await workerWithNotifications(3);
    const list = await request(app).get(`${API}/notifications`).set(auth);

    await request(app).post(`${API}/notifications/${list.body[0].id}/read`).set(auth).expect(200);
    let after = await request(app).get(`${API}/notifications`).set(auth);
    expect(after.body.map((n: { read: boolean }) => n.read)).toEqual([true, false, false]);

    await request(app).post(`${API}/notifications/read-all`).set(auth).expect(200);
    after = await request(app).get(`${API}/notifications`).set(auth);
    expect(after.body.every((n: { read: boolean }) => n.read)).toBe(true);
  });

  it("can't read or change someone else's notifications", async () => {
    const owner = await workerWithNotifications(1);
    const stranger = await workerWithNotifications(0);
    const [note] = (await request(app).get(`${API}/notifications`).set(owner.auth)).body;

    expect((await request(app).get(`${API}/notifications`).set(stranger.auth)).body).toEqual([]);
    await request(app).post(`${API}/notifications/${note.id}/read`).set(stranger.auth).expect(200);
    const stored = await prisma.notification.findUniqueOrThrow({ where: { id: note.id } });
    expect(stored.readAt).toBeNull();
  });

  it('needs login', async () => {
    expect((await request(app).get(`${API}/notifications`)).status).toBe(401);
  });
});
