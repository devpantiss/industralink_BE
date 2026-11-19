import { Router } from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';
import { apiRouter } from '../src/routes.js';

// A tiny admin-only route, only for testing requireRole.
const testRouter = Router();
testRouter.get('/admin-only', requireAuth, requireRole('admin'), (_req, res) => {
  res.json({ ok: true });
});
apiRouter.use('/test', testRouter);

const app = createApp();

async function loginAs(body: Record<string, string>) {
  const res = await request(app).post('/api/v1/auth/dev-login').send(body);
  expect(res.status).toBe(200);
  return res.body.token as string;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('basics', () => {
  it('GET /health reports the database is up', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('unknown routes return 404 in the standard error shape', async () => {
    const res = await request(app).get('/api/v1/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(typeof res.body.message).toBe('string');
  });

  it('broken JSON returns 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/auth/dev-login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
  });
});

describe('dev login', () => {
  it('logs in an employer by email and returns token + safe user', async () => {
    const res = await request(app).post('/api/v1/auth/dev-login').send({ email: 'HR@konark.demo' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ role: 'employer', email: 'hr@konark.demo', status: 'active' });
    expect(res.body.user.companyId).toEqual(expect.any(String));
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('logs in a worker by phone in any common format', async () => {
    const res = await request(app).post('/api/v1/auth/dev-login').send({ phone: '98765 43210' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'worker', phone: '+919876543210' });
  });

  it('rejects a body with zero or two identifiers (422)', async () => {
    const none = await request(app).post('/api/v1/auth/dev-login').send({});
    expect(none.status).toBe(422);
    const two = await request(app)
      .post('/api/v1/auth/dev-login')
      .send({ email: 'hr@konark.demo', phone: '9876543210' });
    expect(two.status).toBe(422);
  });

  it('rejects an invalid phone number (422)', async () => {
    const res = await request(app).post('/api/v1/auth/dev-login').send({ phone: '12345' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for an unknown user', async () => {
    const res = await request(app).post('/api/v1/auth/dev-login').send({ email: 'nobody@x.demo' });
    expect(res.status).toBe(404);
  });

  it('refuses a blocked user (403 BLOCKED)', async () => {
    const res = await request(app).post('/api/v1/auth/dev-login').send({ phone: '9855566677' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BLOCKED');
  });

  it('lists demo users without private fields', async () => {
    const res = await request(app).get('/api/v1/auth/dev-users');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).not.toHaveProperty('passwordHash');
  });
});

describe('requireAuth', () => {
  it('GET /auth/me without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('a fake token returns 401 SESSION_EXPIRED', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_EXPIRED');
  });

  it('GET /auth/me returns the logged-in user', async () => {
    const token = await loginAs({ email: 'admin@industrialink.demo' });
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'admin', name: 'Neha Kapoor' });
  });

  it('logout ends the session immediately', async () => {
    const token = await loginAs({ email: 'hr@westcoast.demo' });
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request(app).post('/api/v1/auth/logout').set(auth)).status).toBe(200);
    const res = await request(app).get('/api/v1/auth/me').set(auth);
    expect(res.status).toBe(401);
  });

  it('blocking a user locks out their open session', async () => {
    const token = await loginAs({ phone: '9811122233' });
    await prisma.user.update({ where: { phone: '+919811122233' }, data: { status: 'blocked' } });
    try {
      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('BLOCKED');
    } finally {
      await prisma.user.update({ where: { phone: '+919811122233' }, data: { status: 'active' } });
    }
  });
});

describe('requireRole', () => {
  it('lets an admin in', async () => {
    const token = await loginAs({ email: 'admin@industrialink.demo' });
    const res = await request(app).get('/api/v1/test/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('keeps a worker out with 403 FORBIDDEN', async () => {
    const token = await loginAs({ phone: '9876543210' });
    const res = await request(app).get('/api/v1/test/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
