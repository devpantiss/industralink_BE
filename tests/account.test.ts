import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { app, authHeader, createEmployer, createWorker } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('/me/settings', () => {
  it('returns defaults and saves changes', async () => {
    const auth = await authHeader(await createWorker());
    const first = await request(app).get('/api/v1/me/settings').set(auth);
    expect(first.body).toEqual({
      language: 'en',
      jobAlerts: true,
      smsAlerts: false,
      whatsappAlerts: false,
      visibleToEmployers: true,
    });

    const saved = await request(app)
      .patch('/api/v1/me/settings')
      .set(auth)
      .send({ language: 'or', visibleToEmployers: false });
    expect(saved.body).toMatchObject({ language: 'or', visibleToEmployers: false, jobAlerts: true });

    const again = await request(app).get('/api/v1/me/settings').set(auth);
    expect(again.body.language).toBe('or');
  });

  it('rejects an unknown language (422)', async () => {
    const auth = await authHeader((await createEmployer()).user);
    const res = await request(app).patch('/api/v1/me/settings').set(auth).send({ language: 'fr' });
    expect(res.status).toBe(422);
  });

  it('needs login (401)', async () => {
    expect((await request(app).get('/api/v1/me/settings')).status).toBe(401);
  });
});

describe('POST /auth/onboarding/complete', () => {
  it('marks the welcome steps as done', async () => {
    const worker = await createWorker();
    expect(worker.onboarded).toBe(false);
    const res = await request(app)
      .post('/api/v1/auth/onboarding/complete')
      .set(await authHeader(worker));
    expect(res.status).toBe(200);
    expect(res.body.onboarded).toBe(true);
  });
});
