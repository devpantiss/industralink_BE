import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { setGoogleVerifier } from '../src/modules/auth/google-auth.service.js';
import type { GoogleProfile } from '../src/modules/auth/google-verifier.js';
import { unauthorized } from '../src/lib/errors.js';
import { adminUser, app, createEmployer, createWorker } from './helpers.js';

const API = '/api/v1';

/**
 * Stands in for Google: each test registers the person behind a token.
 * Unknown tokens fail the way a bad or expired Google token does.
 */
const people = new Map<string, GoogleProfile>();
const fakeGoogle = {
  async verify(idToken: string) {
    const person = people.get(idToken);
    if (!person) throw unauthorized('Google sign-in did not work. Please try again.', 'GOOGLE_TOKEN_INVALID');
    return person;
  },
};

let counter = 0;
/** A Google person and the token their phone would send (real tokens are long). */
function googlePerson(overrides: Partial<GoogleProfile> = {}) {
  const n = `${Date.now()}${++counter}`;
  const person: GoogleProfile = {
    googleId: `1${n}`,
    email: `person${n}@gmail.com`,
    name: 'Suresh Nayak',
    ...overrides,
  };
  const token = `test-token.${n}.`.padEnd(160, 'x');
  people.set(token, person);
  return { person, token };
}

const google = (body: object) => request(app).post(`${API}/auth/google`).send(body);

beforeEach(() => setGoogleVerifier(fakeGoogle));

afterAll(async () => {
  setGoogleVerifier(null);
  await prisma.$disconnect();
});

describe('POST /auth/google', () => {
  it('answers "not available" while Google sign-in is not set up', async () => {
    setGoogleVerifier(null);
    const { token } = googlePerson();
    const res = await google({ idToken: token, role: 'worker' }).expect(503);
    expect(res.body.code).toBe('GOOGLE_OFF');
  });

  it('checks the request', async () => {
    const { token } = googlePerson();
    await google({ role: 'worker' }).expect(422);
    await google({ idToken: 'short', role: 'worker' }).expect(422);
    await google({ idToken: token }).expect(422);
    await google({ idToken: token, role: 'admin' }).expect(422);
  });

  it('refuses a token Google did not sign for us', async () => {
    const res = await google({ idToken: 'not-a-real-token.'.padEnd(160, 'x'), role: 'worker' }).expect(401);
    expect(res.body.code).toBe('GOOGLE_TOKEN_INVALID');
  });

  describe('worker', () => {
    it('signs up with no OTP or phone, then logs in to the same account', async () => {
      const { person, token } = googlePerson({ name: 'Ramesh Sahu' });

      const first = await google({ idToken: token, role: 'worker' }).expect(201);
      expect(first.body.token).toEqual(expect.any(String));
      expect(first.body.user).toMatchObject({ role: 'worker', name: 'Ramesh Sahu', onboarded: false });

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: first.body.user.id },
        include: { workerProfile: true, settings: true },
      });
      expect(user).toMatchObject({ email: person.email, googleId: person.googleId, phone: null });
      expect(user.workerProfile).not.toBeNull();
      expect(user.settings).not.toBeNull();

      const again = await google({ idToken: token, role: 'worker' }).expect(200);
      expect(again.body.user.id).toBe(first.body.user.id);

      // The token works for the API.
      await request(app)
        .get(`${API}/auth/me`)
        .set({ Authorization: `Bearer ${again.body.token}` })
        .expect(200);
    });

    it('still logs in after they change their Gmail address', async () => {
      const { person, token } = googlePerson();
      const first = await google({ idToken: token, role: 'worker' }).expect(201);

      const { token: newToken } = googlePerson({ googleId: person.googleId, email: `new${person.email}` });
      const res = await google({ idToken: newToken, role: 'worker' }).expect(200);
      expect(res.body.user.id).toBe(first.body.user.id);
    });

    it('links Google to a worker account that already has this email', async () => {
      const worker = await createWorker();
      const { person, token } = googlePerson();
      await prisma.user.update({ where: { id: worker.id }, data: { email: person.email } });

      const res = await google({ idToken: token, role: 'worker' }).expect(200);
      expect(res.body.user.id).toBe(worker.id);
      const linked = await prisma.user.findUniqueOrThrow({ where: { id: worker.id } });
      expect(linked.googleId).toBe(person.googleId);
    });

    it('makes one account when the button is tapped twice at once', async () => {
      const { person, token } = googlePerson();
      const results = await Promise.all([
        google({ idToken: token, role: 'worker' }),
        google({ idToken: token, role: 'worker' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
      expect(results[0]!.body.user.id).toBe(results[1]!.body.user.id);
      expect(await prisma.user.count({ where: { googleId: person.googleId } })).toBe(1);
    });
  });

  describe('HR', () => {
    it('asks for the company name the first time, then creates the company', async () => {
      const { person, token } = googlePerson({ name: 'Pradeep Mohanty' });

      const ask = await google({ idToken: token, role: 'employer' }).expect(422);
      expect(ask.body.code).toBe('COMPANY_NAME_NEEDED');
      expect(await prisma.user.count({ where: { googleId: person.googleId } })).toBe(0);

      const res = await google({
        idToken: token,
        role: 'employer',
        companyName: '  Utkal Steel Works ',
      }).expect(201);
      expect(res.body.user).toMatchObject({ role: 'employer', name: 'Pradeep Mohanty', onboarded: false });

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: res.body.user.id },
        include: { company: true },
      });
      expect(user.googleId).toBe(person.googleId);
      expect(user.company).toMatchObject({ name: 'Utkal Steel Works', verification: 'pending' });

      // Next time no company name is needed.
      const again = await google({ idToken: token, role: 'employer' }).expect(200);
      expect(again.body.user.id).toBe(user.id);
    });

    it('links Google to an HR account made with email', async () => {
      const { user } = await createEmployer();
      await prisma.user.update({ where: { id: user.id }, data: { status: 'active' } });
      const { person, token } = googlePerson({ email: user.email! });

      const res = await google({ idToken: token, role: 'employer' }).expect(200);
      expect(res.body.user.id).toBe(user.id);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).googleId).toBe(
        person.googleId,
      );
    });
  });

  describe('refuses', () => {
    it('the wrong tab: a worker account on "I’m hiring", and the other way round', async () => {
      const { token } = googlePerson();
      await google({ idToken: token, role: 'worker' }).expect(201);
      const res = await google({ idToken: token, role: 'employer', companyName: 'Some Company' }).expect(409);
      expect(res.body.code).toBe('WRONG_ROLE');
      expect(res.body.message).toContain('I need a job');

      const { user } = await createEmployer();
      const { token: hrToken } = googlePerson({ email: user.email! });
      const back = await google({ idToken: hrToken, role: 'worker' }).expect(409);
      expect(back.body.message).toContain('I’m hiring');
    });

    it('admin accounts', async () => {
      const admin = await adminUser();
      const { token } = googlePerson({ email: admin.email! });
      const res = await google({ idToken: token, role: 'employer' }).expect(403);
      expect(res.body.code).toBe('GOOGLE_NOT_FOR_ADMIN');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).googleId).toBeNull();
    });

    it('an email already linked to another Google account', async () => {
      const { person, token } = googlePerson();
      await google({ idToken: token, role: 'worker' }).expect(201);
      const { token: other } = googlePerson({ email: person.email });
      const res = await google({ idToken: other, role: 'worker' }).expect(409);
      expect(res.body.code).toBe('GOOGLE_ACCOUNT_MISMATCH');
    });

    it('a blocked account', async () => {
      const { token } = googlePerson();
      const first = await google({ idToken: token, role: 'worker' }).expect(201);
      await prisma.user.update({ where: { id: first.body.user.id }, data: { status: 'blocked' } });
      const res = await google({ idToken: token, role: 'worker' }).expect(403);
      expect(res.body.code).toBe('BLOCKED');
    });
  });

  it('after "delete my account", the same Google account starts fresh', async () => {
    const { person, token } = googlePerson();
    const first = await google({ idToken: token, role: 'worker' }).expect(201);
    await request(app)
      .post(`${API}/me/delete`)
      .set({ Authorization: `Bearer ${first.body.token}` })
      .send({ confirm: 'DELETE' })
      .expect(200);

    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: first.body.user.id } });
    expect(deleted).toMatchObject({ googleId: null, email: null });

    const fresh = await google({ idToken: token, role: 'worker' }).expect(201);
    expect(fresh.body.user.id).not.toBe(first.body.user.id);
    expect(await prisma.user.count({ where: { googleId: person.googleId } })).toBe(1);
  });
});
