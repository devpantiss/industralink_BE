import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { adminUser, app, authHeader, createWorker } from './helpers.js';

const API = '/api/v1';
let admin: { Authorization: string };

beforeAll(async () => {
  admin = await authHeader(await adminUser());
});

const ticketsAbout = (topic: string) =>
  request(app)
    .get(`${API}/admin/support?status=all`)
    .set(admin)
    .then((res) => res.body.filter((t: { topic: string }) => t.topic === topic));

describe('help form', () => {
  it('a logged-in user: name and contact come from the account', async () => {
    const worker = await createWorker('Bikash Das');
    const res = await request(app)
      .post(`${API}/support`)
      .set(await authHeader(worker))
      .send({ topic: 'Login help A', message: 'I cannot see my applications.', contact: 'ignored@x.in' });
    expect(res.status).toBe(201);

    const [ticket] = await ticketsAbout('Login help A');
    expect(ticket).toMatchObject({
      userId: worker.id,
      name: 'Bikash Das',
      contact: `+91 ${worker.phone!.slice(3)}`,
      role: 'worker',
      status: 'open',
    });
  });

  it('a guest must give a phone or email', async () => {
    const noContact = await request(app)
      .post(`${API}/support`)
      .send({ topic: 'Guest B', message: 'How do I apply here?' });
    expect(noContact.status).toBe(422);

    const bad = await request(app)
      .post(`${API}/support`)
      .send({ topic: 'Guest B', message: 'How do I apply here?', contact: '123' });
    expect(bad.status).toBe(422);

    await request(app)
      .post(`${API}/support`)
      .send({ topic: 'Guest B', message: 'How do I apply here?', name: 'Mina', contact: '98765 11111' })
      .expect(201);
    const [ticket] = await ticketsAbout('Guest B');
    expect(ticket).toMatchObject({ name: 'Mina', contact: '+91 9876511111', role: 'guest' });
    expect(ticket.userId).toBeUndefined();
  });

  it('a too-short message is refused', async () => {
    const res = await request(app)
      .post(`${API}/support`)
      .send({ topic: 'X', message: 'help', contact: 'a@b.in' });
    expect(res.status).toBe(422);
  });

  it('an expired login still works as a guest', async () => {
    const res = await request(app)
      .post(`${API}/support`)
      .set({ Authorization: 'Bearer not-a-real-token' })
      .send({ topic: 'Guest C', message: 'Please call me back.', contact: 'mina@example.in' });
    expect(res.status).toBe(201);
  });
});

describe('admin help requests', () => {
  it('closing tells the user and moves it to closed', async () => {
    const worker = await createWorker();
    await request(app)
      .post(`${API}/support`)
      .set(await authHeader(worker))
      .send({ topic: 'Close me D', message: 'My resume did not upload.' });
    const [ticket] = await ticketsAbout('Close me D');

    await request(app).post(`${API}/admin/support/${ticket.id}/close`).set(admin).expect(200);
    const [after] = await ticketsAbout('Close me D');
    expect(after.status).toBe('closed');
    const note = await prisma.notification.findFirst({ where: { userId: worker.id } });
    expect(note?.title).toBe('Your help request was answered');

    const open = await request(app).get(`${API}/admin/support`).set(admin);
    expect(open.body.some((t: { id: string }) => t.id === ticket.id)).toBe(false);
  });

  it('is only for admins', async () => {
    const worker = await authHeader(await createWorker());
    expect((await request(app).get(`${API}/admin/support`).set(worker)).status).toBe(403);
  });
});
