import { existsSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import type { User } from '../src/generated/prisma/client.js';
import { app, authHeader, createEmployer, createWorker, pathOf, samplePngDataUrl } from './helpers.js';

let worker: User;
let auth: { Authorization: string };

beforeAll(async () => {
  worker = await createWorker('Bikash Mohanty');
  auth = await authHeader(worker);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /worker/profile', () => {
  it('returns the profile in the app shape with completeness', async () => {
    const res = await request(app).get('/api/v1/worker/profile').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: worker.id,
      name: 'Bikash Mohanty',
      phone: worker.phone!.slice(3),
      skills: [],
      availability: 'immediate',
      workHistory: [],
    });
    expect(res.body.completeness.score).toBe(0);
    expect(res.body.completeness.missing[0]).toMatchObject({ key: 'resume' });
  });

  it('is only for workers (403 for an employer)', async () => {
    const { user } = await createEmployer();
    const res = await request(app)
      .get('/api/v1/worker/profile')
      .set(await authHeader(user));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /worker/profile', () => {
  it('saves the fields sent and keeps the rest', async () => {
    const res = await request(app)
      .patch('/api/v1/worker/profile')
      .set(auth)
      .send({
        name: '  Bikash K. Mohanty ',
        trade: 'fitter',
        experience: '3_5',
        skills: ['Pipe fitting', 'Pipe fitting', ' Gas cutting ', ''],
        qualifications: ['ITI'],
        location: { city: 'Angul', state: 'Odisha' },
        pincode: '759122',
        expectedPay: '22000',
        dob: '1996-04-12',
        phone: '9999999999', // ignored: phone can't be changed here
        userId: 'ignored',
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Bikash K. Mohanty',
      phone: worker.phone!.slice(3),
      trade: 'fitter',
      skills: ['Pipe fitting', 'Gas cutting'],
      location: { city: 'Angul', state: 'Odisha' },
      expectedPay: 22000,
      dob: '1996-04-12',
    });
    // 5 of 7 checks done (trade, city, skills, education, pay); resume and certificate missing.
    expect(res.body.completeness.score).toBe(71);

    const me = await request(app).get('/api/v1/auth/me').set(auth);
    expect(me.body.name).toBe('Bikash K. Mohanty');
  });

  it('replaces the work history list', async () => {
    const res = await request(app)
      .patch('/api/v1/worker/profile')
      .set(auth)
      .send({
        workHistory: [
          { company: 'Mahanadi Steel', role: 'Fitter', from: '2021', to: '' },
          { company: 'Local workshop', role: 'Helper', from: 2018, to: 2021 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.workHistory).toEqual([
      { company: 'Mahanadi Steel', role: 'Fitter', from: '2021' },
      { company: 'Local workshop', role: 'Helper', from: '2018', to: '2021' },
    ]);
    expect(res.body.trade).toBe('fitter'); // untouched
  });

  it('clears a field with an empty string', async () => {
    await request(app).patch('/api/v1/worker/profile').set(auth).send({ about: 'Hard working' });
    const res = await request(app).patch('/api/v1/worker/profile').set(auth).send({ about: '' });
    expect(res.status).toBe(200);
    expect(res.body.about).toBeUndefined();
  });

  it.each([
    [{ pincode: '12345' }, 'pincode'],
    [{ trade: 'astronaut' }, 'trade'],
    [{ expectedPay: -5 }, 'expectedPay'],
    [{ dob: '12/04/1996' }, 'dob'],
    [{ workHistory: [{ company: 'A', role: 'B', from: 2020, to: 2019 }] }, 'workHistory.0.to'],
  ])('rejects bad data %j (422)', async (body, field) => {
    const res = await request(app).patch('/api/v1/worker/profile').set(auth).send(body);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toContain(field);
  });

  it('refuses an email used by another account (409)', async () => {
    const res = await request(app)
      .patch('/api/v1/worker/profile')
      .set(auth)
      .send({ email: 'hr@konark.demo' });
    expect(res.status).toBe(409);
  });

  it('saves, serves and removes a profile photo', async () => {
    const saved = await request(app)
      .patch('/api/v1/worker/profile')
      .set(auth)
      .send({ photoUrl: samplePngDataUrl });
    expect(saved.status).toBe(200);
    expect(saved.body.photoUrl).toMatch(/\/files\/workers\/.+\/photo\/.+\.png\?expires=/);

    const file = await request(app).get(pathOf(saved.body.photoUrl));
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');

    // Sending the same link back (e.g. the whole profile) does not change the photo.
    const unchanged = await request(app)
      .patch('/api/v1/worker/profile')
      .set(auth)
      .send({ photoUrl: saved.body.photoUrl });
    expect(new URL(unchanged.body.photoUrl).pathname).toBe(new URL(saved.body.photoUrl).pathname);

    const { photoKey } = await prisma.workerProfile.findUniqueOrThrow({ where: { userId: worker.id } });
    const removed = await request(app).patch('/api/v1/worker/profile').set(auth).send({ photoUrl: null });
    expect(removed.body.photoUrl).toBeUndefined();
    expect(existsSync(path.join('.test-uploads', photoKey!))).toBe(false);
  });

  it('rejects a photo that is not an image (415)', async () => {
    const res = await request(app)
      .patch('/api/v1/worker/profile')
      .set(auth)
      .send({ photoUrl: `data:image/png;base64,${Buffer.from('not an image').toString('base64')}` });
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('BAD_TYPE');
  });
});
