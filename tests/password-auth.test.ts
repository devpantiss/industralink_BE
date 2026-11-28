import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { hashPassword } from '../src/lib/password.js';
import { adminUser, app, createEmployer, createJobInDb, createWorker, uniqueWord } from './helpers.js';

const API = '/api/v1';
type Auth = { Authorization: string };

afterAll(async () => {
  await prisma.$disconnect();
});

const newEmail = () => `${uniqueWord()}@gmail.com`;
const bearer = (token: string): Auth => ({ Authorization: `Bearer ${token}` });

const signupWorker = (body: object) => request(app).post(`${API}/auth/signup/worker`).send(body);
const signupEmployer = (body: object) => request(app).post(`${API}/auth/signup/employer`).send(body);
const login = (body: object) => request(app).post(`${API}/auth/login`).send(body);
const savePhone = (auth: Auth, phone: string) =>
  request(app).put(`${API}/me/phone`).set(auth).send({ phone });
const randomPhone = () => `9${Math.floor(100_000_000 + Math.random() * 899_999_999)}`;

/** A worker made through the real sign-up (with a mobile number), logged in. */
async function newWorker(password = 'safe-pass-1') {
  const email = newEmail();
  const res = await signupWorker({ name: 'Anil Munda', phone: randomPhone(), email, password }).expect(201);
  return { email, password, user: res.body.user, auth: bearer(res.body.token) };
}

describe('sign up', () => {
  it('worker: name, mobile number, email + password; welcome steps next', async () => {
    const email = `  ${uniqueWord()}@Gmail.COM `;
    const phone = randomPhone();
    const res = await signupWorker({
      name: ' Anil Munda ',
      phone: `0${phone}`,
      email,
      password: 'safe-pass-1',
    }).expect(201);

    expect(res.body.user).toMatchObject({
      role: 'worker',
      name: 'Anil Munda',
      email: email.trim().toLowerCase(),
      onboarded: false,
      hasPassword: true,
      hasGoogle: false,
    });
    expect(res.body.user.phone).toBe(phone);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(stored.passwordHash).not.toContain('safe-pass-1');

    const auth = bearer(res.body.token);
    await request(app).get(`${API}/worker/profile`).set(auth).expect(200);
    await request(app).get(`${API}/me/settings`).set(auth).expect(200);
  });

  it('HR: the company is created and waits for approval', async () => {
    const res = await signupEmployer({
      name: 'Pooja Sahu',
      email: newEmail(),
      password: 'safe-pass-1',
      companyName: 'Paradip Bulk Handling',
    }).expect(201);
    expect(res.body.user).toMatchObject({ role: 'employer', onboarded: false });
    const company = await request(app).get(`${API}/employer/company`).set(bearer(res.body.token));
    expect(company.body).toMatchObject({ name: 'Paradip Bulk Handling', verification: 'pending' });
  });

  it('one account per email, whatever the role or case', async () => {
    const { email } = await newWorker();
    const again = await signupWorker({
      name: 'Someone',
      phone: randomPhone(),
      email: email.toUpperCase(),
      password: 'other-pass',
    });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('EXISTS');
    const asHr = await signupEmployer({ name: 'X Y', email, password: 'other-pass', companyName: 'Other' });
    expect(asHr.status).toBe(409);
  });

  it('one account per mobile number', async () => {
    const other = await createWorker();
    const res = await signupWorker({
      name: 'Anil Munda',
      phone: other.phone!.slice(3),
      email: newEmail(),
      password: 'safe-pass-1',
    }).expect(409);
    expect(res.body.code).toBe('PHONE_TAKEN');
  });

  it('an email that signed up with Google is told to use Google', async () => {
    const email = newEmail();
    const worker = await createWorker();
    await prisma.user.update({ where: { id: worker.id }, data: { email, googleId: `g-${uniqueWord()}` } });
    const res = await signupWorker({
      name: 'Anil Munda',
      phone: randomPhone(),
      email,
      password: 'safe-pass-1',
    }).expect(409);
    expect(res.body.code).toBe('EXISTS_GOOGLE');
  });

  it('checks the details (422)', async () => {
    await signupWorker({
      name: 'A',
      phone: randomPhone(),
      email: newEmail(),
      password: 'safe-pass-1',
    }).expect(422);
    await signupWorker({ name: 'Anil Munda', email: newEmail(), password: 'safe-pass-1' }).expect(422);
    await signupWorker({
      name: 'Anil Munda',
      phone: '12345',
      email: newEmail(),
      password: 'safe-pass-1',
    }).expect(422);
    await signupWorker({
      name: 'Anil Munda',
      phone: randomPhone(),
      email: 'not-an-email',
      password: 'safe-pass-1',
    }).expect(422);
    await signupWorker({
      name: 'Anil Munda',
      phone: randomPhone(),
      email: newEmail(),
      password: 'short',
    }).expect(422);
    await signupWorker({
      name: 'Anil Munda',
      phone: randomPhone(),
      email: newEmail(),
      password: 'x'.repeat(129),
    }).expect(422);
    await signupEmployer({ name: 'Pooja Sahu', email: newEmail(), password: 'safe-pass-1' }).expect(422);
  });

  it('there is no sign-up for admins', async () => {
    await request(app)
      .post(`${API}/auth/signup/admin`)
      .send({ name: 'Hacker', email: newEmail(), password: 'safe-pass-1' })
      .expect(404);
  });
});

describe('log in', () => {
  it('right password logs in, with any letter case in the email', async () => {
    const { email, password, user } = await newWorker();
    const res = await login({ email: ` ${email.toUpperCase()} `, password, role: 'worker' }).expect(200);
    expect(res.body.user.id).toBe(user.id);
    await request(app).get(`${API}/auth/me`).set(bearer(res.body.token)).expect(200);
  });

  it('wrong password and unknown email get the same answer', async () => {
    const { email } = await newWorker();
    const wrong = await login({ email, password: 'not-my-password' }).expect(401);
    const unknown = await login({ email: newEmail(), password: 'not-my-password' }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('the wrong tab says which tab to use, but only after the right password', async () => {
    const { email, password } = await newWorker();
    const res = await login({ email, password, role: 'employer' }).expect(409);
    expect(res.body.code).toBe('WRONG_ROLE');
    expect(res.body.message).toContain('I need a job');
    await login({ email, password: 'not-my-password', role: 'employer' }).expect(401);
  });

  it('admins log in from the "I\'m hiring" tab or the admin page, not the worker tab', async () => {
    const admin = await adminUser();
    const password = 'admin-pass-1';
    await prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(password) },
    });
    await login({ email: admin.email, password, role: 'employer' }).expect(200);
    await login({ email: admin.email, password }).expect(200);
    await login({ email: admin.email, password, role: 'worker' }).expect(409);
  });

  it('an account made with Google is told to use Google', async () => {
    const worker = await createWorker();
    const email = newEmail();
    await prisma.user.update({ where: { id: worker.id }, data: { email, googleId: `g-${uniqueWord()}` } });
    const res = await login({ email, password: 'anything-1' }).expect(401);
    expect(res.body.code).toBe('USE_GOOGLE');
  });

  it('blocked and deleted accounts cannot log in', async () => {
    const blocked = await newWorker();
    await prisma.user.update({ where: { id: blocked.user.id }, data: { status: 'blocked' } });
    expect((await login({ email: blocked.email, password: blocked.password })).body.code).toBe('BLOCKED');

    const gone = await newWorker();
    await request(app).post(`${API}/me/delete`).set(gone.auth).send({ confirm: 'DELETE' }).expect(200);
    await login({ email: gone.email, password: gone.password }).expect(401);
  });

  it('checks the request (422)', async () => {
    await login({ email: newEmail() }).expect(422);
    await login({ password: 'x' }).expect(422);
    await login({ email: newEmail(), password: 'x', role: 'admin' }).expect(422);
  });

  it('stops password guessing on one account: 10 wrong tries, then wait', async () => {
    const { email, password } = await newWorker();
    for (let i = 0; i < 10; i++) await login({ email, password: `guess-${i}` }).expect(401);
    const res = await login({ email, password }).expect(429);
    expect(res.body.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('change password', () => {
  const change = (auth: Auth, body: object) =>
    request(app).post(`${API}/auth/password/change`).set(auth).send(body);

  it('needs the current password; other devices are logged out, this one stays', async () => {
    const { email, password, auth } = await newWorker();
    const otherDevice = bearer((await login({ email, password }).expect(200)).body.token);

    expect((await change(auth, { current: 'not-it', next: 'new-pass-22' })).body.code).toBe('WRONG_PASSWORD');
    await change(auth, { next: 'new-pass-22' }).expect(422);
    await change(auth, { current: password, next: 'short' }).expect(422);

    await change(auth, { current: password, next: 'new-pass-22' }).expect(200);
    await request(app).get(`${API}/auth/me`).set(auth).expect(200);
    await request(app).get(`${API}/auth/me`).set(otherDevice).expect(401);
    await login({ email, password }).expect(401);
    await login({ email, password: 'new-pass-22' }).expect(200);
  });

  it('an account made with Google can set a first password, then use both', async () => {
    const worker = await createWorker();
    const email = newEmail();
    await prisma.user.update({ where: { id: worker.id }, data: { email, googleId: `g-${uniqueWord()}` } });
    const res = await request(app).post(`${API}/auth/dev-login`).send({ userId: worker.id });
    const auth = bearer(res.body.token);
    expect(res.body.user).toMatchObject({ hasPassword: false, hasGoogle: true });

    await change(auth, { next: 'first-pass-1' }).expect(200);
    const after = await login({ email, password: 'first-pass-1', role: 'worker' }).expect(200);
    expect(after.body.user).toMatchObject({ hasPassword: true, hasGoogle: true });
  });
});

/** A worker with no mobile number yet, like right after "Sign up with Google". */
async function workerWithoutPhone() {
  const worker = await createWorker();
  await prisma.user.update({
    where: { id: worker.id },
    data: { phone: null, email: newEmail(), googleId: `g-${uniqueWord()}` },
  });
  const res = await request(app).post(`${API}/auth/dev-login`).send({ userId: worker.id });
  return { user: res.body.user, auth: bearer(res.body.token) };
}

describe('mobile number (welcome step after Google, or changed later)', () => {
  it('a worker adds it; it is stored as +91 and returned as 10 digits', async () => {
    const { auth, user } = await workerWithoutPhone();
    const phone = randomPhone();
    const res = await savePhone(auth, `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`).expect(200);
    expect(res.body.phone).toBe(phone);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).phone).toBe(`+91${phone}`);
    await savePhone(auth, phone).expect(200); // the same number again is fine
  });

  it('checks the number, and one number belongs to one account', async () => {
    const { auth } = await newWorker();
    await savePhone(auth, '12345').expect(422);
    await savePhone(auth, '5876543210').expect(422);

    const other = await createWorker();
    const taken = await savePhone(auth, other.phone!.slice(3)).expect(409);
    expect(taken.body.code).toBe('PHONE_TAKEN');
  });

  it('HR and admins do not use it (403)', async () => {
    const { user } = await createEmployer();
    const res = await request(app).post(`${API}/auth/dev-login`).send({ userId: user.id });
    await savePhone(bearer(res.body.token), randomPhone()).expect(403);
  });

  it('is needed to finish the welcome steps and to apply', async () => {
    const { auth } = await workerWithoutPhone();
    const { company } = await createEmployer({ verification: 'approved' });
    const job = await createJobInDb(company.id);

    const finish = await request(app).post(`${API}/auth/onboarding/complete`).set(auth).expect(422);
    expect(finish.body.code).toBe('PHONE_NEEDED');
    const apply = await request(app).post(`${API}/jobs/${job.id}/apply`).set(auth).send({}).expect(422);
    expect(apply.body.code).toBe('PHONE_NEEDED');

    await savePhone(auth, randomPhone()).expect(200);
    const done = await request(app).post(`${API}/auth/onboarding/complete`).set(auth).expect(200);
    expect(done.body.onboarded).toBe(true);
    await request(app).post(`${API}/jobs/${job.id}/apply`).set(auth).send({}).expect(201);
  });

  it('HR finish the welcome steps without one', async () => {
    const res = await signupEmployer({
      name: 'Pooja Sahu',
      email: newEmail(),
      password: 'safe-pass-1',
      companyName: 'Paradip Bulk Handling',
    });
    await request(app).post(`${API}/auth/onboarding/complete`).set(bearer(res.body.token)).expect(200);
  });
});
