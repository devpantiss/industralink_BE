import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import type { User } from '../src/generated/prisma/client.js';
import { app, authHeader, createEmployer, createJobInDb, createWorker } from './helpers.js';

const API = '/api/v1';
const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

interface Setup {
  worker: User;
  workerAuth: { Authorization: string };
  hr: User;
  hrAuth: { Authorization: string };
  companyId: string;
  jobId: string;
}

let s: Setup;

beforeEach(async () => {
  const { company, user: hr } = await createEmployer({ verification: 'approved' });
  await prisma.user.update({ where: { id: hr.id }, data: { status: 'active' } });
  const job = await createJobInDb(company.id, {
    title: 'Fitter',
    allowCalls: true,
    hrPhone: '+919812345678',
    callHours: '10 AM – 5 PM',
  });
  const worker = await createWorker('Ravi Kumar');
  s = {
    worker,
    workerAuth: await authHeader(worker),
    hr,
    hrAuth: await authHeader(hr),
    companyId: company.id,
    jobId: job.id,
  };
});

const apply = (body: object = {}) =>
  request(app).post(`${API}/jobs/${s.jobId}/apply`).set(s.workerAuth).send(body);

const move = (applicationId: string, body: object) =>
  request(app).patch(`${API}/employer/applications/${applicationId}`).set(s.hrAuth).send(body);

const workerView = (applicationId: string) =>
  request(app).get(`${API}/worker/applications/${applicationId}`).set(s.workerAuth);

describe('Worker applies', () => {
  it('applies with the profile and tells HR', async () => {
    const res = await apply();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ jobId: s.jobId, stage: 'applied', sentWith: 'profile' });
    expect(res.body.timeline).toEqual([expect.objectContaining({ stage: 'applied' })]);
    expect(res.body.job.hrPhone).toBeUndefined();
    expect(res.body.contact).toBeUndefined();

    const note = await prisma.notification.findFirst({ where: { userId: s.hr.id, title: 'New applicant' } });
    expect(note?.body).toContain('Ravi Kumar');

    const job = await request(app).get(`${API}/jobs/${s.jobId}`).set(s.workerAuth);
    expect(job.body.appliedApplicationId).toBe(res.body.id);
  });

  it('refuses a second application', async () => {
    await apply();
    const res = await apply();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_APPLIED');
  });

  it('refuses closed jobs', async () => {
    await prisma.job.update({ where: { id: s.jobId }, data: { status: 'closed' } });
    const res = await apply();
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('JOB_CLOSED');
  });

  it('refuses jobs past their last date', async () => {
    await prisma.job.update({ where: { id: s.jobId }, data: { deadline: new Date('2020-01-01') } });
    expect((await apply()).status).toBe(410);
  });

  it('needs one of their own documents when applying with a document', async () => {
    const other = await createWorker();
    const othersDoc = await prisma.workerDocument.create({
      data: {
        workerId: other.id,
        type: 'resume',
        name: 'cv.pdf',
        storageKey: 'x/cv.pdf',
        sizeBytes: 10,
        mimeType: 'application/pdf',
      },
    });
    let res = await apply({ sentWith: 'document' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_DOCUMENT');

    res = await apply({ sentWith: 'document', documentId: othersDoc.id });
    expect(res.body.code).toBe('NO_DOCUMENT');

    const mine = await prisma.workerDocument.create({
      data: {
        workerId: s.worker.id,
        type: 'resume',
        name: 'cv.pdf',
        storageKey: 'x/mine.pdf',
        sizeBytes: 10,
        mimeType: 'application/pdf',
      },
    });
    res = await apply({ sentWith: 'document', documentId: mine.id });
    expect(res.status).toBe(201);
    expect(res.body.documentId).toBe(mine.id);
  });

  it("lists only the worker's own applications", async () => {
    const { body: mine } = await apply();
    const list = await request(app).get(`${API}/worker/applications`).set(s.workerAuth);
    expect(list.body.map((a: { id: string }) => a.id)).toEqual([mine.id]);

    const stranger = await createWorker();
    const res = await request(app)
      .get(`${API}/worker/applications/${mine.id}`)
      .set(await authHeader(stranger));
    expect(res.status).toBe(404);
  });

  it('withdraws, and cannot apply again', async () => {
    const { body: mine } = await apply();
    const res = await request(app).post(`${API}/worker/applications/${mine.id}/withdraw`).set(s.workerAuth);
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('withdrawn');

    const again = await request(app).post(`${API}/worker/applications/${mine.id}/withdraw`).set(s.workerAuth);
    expect(again.body.code).toBe('CLOSED');

    expect((await apply()).body.code).toBe('WITHDRAWN');
    expect((await move(mine.id, { stage: 'shortlisted' })).body.code).toBe('WITHDRAWN');
  });

  it('employers cannot use worker routes', async () => {
    const res = await request(app).get(`${API}/worker/applications`).set(s.hrAuth);
    expect(res.status).toBe(403);
  });
});

describe('Employer sees candidates', () => {
  it('lists the candidates of a job and clears the "new" count', async () => {
    await apply();
    let job = await request(app).get(`${API}/employer/jobs/${s.jobId}`).set(s.hrAuth);
    expect(job.body.newApplicantsCount).toBe(1);

    const res = await request(app).get(`${API}/employer/jobs/${s.jobId}/candidates`).set(s.hrAuth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ jobTitle: 'Fitter', worker: { name: 'Ravi Kumar' } });
    expect(Array.isArray(res.body[0].documents)).toBe(true);

    job = await request(app).get(`${API}/employer/jobs/${s.jobId}`).set(s.hrAuth);
    expect(job.body.newApplicantsCount).toBe(0);
    expect(job.body.applicantsCount).toBe(1);
  });

  it('searches and filters all candidates', async () => {
    await apply();
    const byName = await request(app).get(`${API}/employer/candidates?q=ravi`).set(s.hrAuth);
    expect(byName.body).toHaveLength(1);
    const none = await request(app).get(`${API}/employer/candidates?q=nobody`).set(s.hrAuth);
    expect(none.body).toHaveLength(0);
    const byStage = await request(app).get(`${API}/employer/candidates?stage=hired`).set(s.hrAuth);
    expect(byStage.body).toHaveLength(0);
  });

  it("can't see another company's candidates", async () => {
    const { body: mine } = await apply();
    const other = await createEmployer({ verification: 'approved' });
    const otherAuth = await authHeader(other.user);

    expect((await request(app).get(`${API}/employer/jobs/${s.jobId}/candidates`).set(otherAuth)).status).toBe(
      404,
    );
    expect((await request(app).get(`${API}/employer/candidates`).set(otherAuth)).body).toHaveLength(0);
    const res = await request(app)
      .patch(`${API}/employer/applications/${mine.id}`)
      .set(otherAuth)
      .send({ stage: 'shortlisted' });
    expect(res.status).toBe(404);
  });

  it('marks a candidate as seen only once', async () => {
    const { body: mine } = await apply();
    for (let i = 0; i < 2; i++) {
      const res = await request(app).post(`${API}/employer/applications/${mine.id}/view`).set(s.hrAuth);
      expect(res.body).toEqual({ ok: true });
    }
    const { body } = await workerView(mine.id);
    expect(body.timeline.filter((e: { stage: string }) => e.stage === 'viewed')).toHaveLength(1);
  });
});

describe('Employer moves a candidate', () => {
  it('shortlisting shows the HR phone to the worker and tells them', async () => {
    const { body: mine } = await apply();
    const res = await move(mine.id, { stage: 'shortlisted' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('shortlisted');

    const { body } = await workerView(mine.id);
    expect(body.contact).toEqual({ phone: '9812345678', hours: '10 AM – 5 PM' });
    expect(body.timeline.map((e: { stage: string }) => e.stage)).toEqual([
      'applied',
      'viewed',
      'shortlisted',
    ]);

    const note = await prisma.notification.findFirst({ where: { userId: s.worker.id } });
    expect(note?.body).toContain('shortlisted');
  });

  it('keeps the HR phone hidden when calls are off', async () => {
    await prisma.job.update({ where: { id: s.jobId }, data: { allowCalls: false } });
    const { body: mine } = await apply();
    await move(mine.id, { stage: 'shortlisted' });
    expect((await workerView(mine.id)).body.contact).toBeUndefined();
  });

  it('never shows the private "not suitable" reason to the worker', async () => {
    const { body: mine } = await apply();
    const res = await move(mine.id, { stage: 'rejected', note: 'Not enough experience', notify: false });
    expect(res.body.rejectionNote).toBe('Not enough experience');

    const { body } = await workerView(mine.id);
    expect(body.stage).toBe('rejected');
    expect(body.rejectionNote).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('Not enough experience');

    const list = await request(app).get(`${API}/worker/applications`).set(s.workerAuth);
    expect(JSON.stringify(list.body)).not.toContain('Not enough experience');

    // notify: false = no message to the worker.
    expect(await prisma.notification.count({ where: { userId: s.worker.id } })).toBe(0);
  });

  it('sets up an interview; the worker replies; a new time clears the reply', async () => {
    const { body: mine } = await apply();
    let res = await move(mine.id, { stage: 'interview' });
    expect(res.status).toBe(422);

    res = await move(mine.id, { stage: 'interview', interview: { at: '2020-01-01T10:00:00.000Z' } });
    expect(res.status).toBe(422);

    const at = tomorrow().toISOString();
    res = await move(mine.id, { stage: 'interview', interview: { at, place: 'Gate 2', bring: 'Aadhaar' } });
    expect(res.status).toBe(200);
    expect(res.body.interview).toMatchObject({ place: 'Gate 2', bring: 'Aadhaar' });

    res = await request(app)
      .post(`${API}/worker/applications/${mine.id}/interview-response`)
      .set(s.workerAuth)
      .send({ response: 'attending' });
    expect(res.status).toBe(200);
    expect(res.body.interview.response).toBe('attending');
    expect(
      await prisma.notification.count({ where: { userId: s.hr.id, title: 'Interview confirmed' } }),
    ).toBe(1);

    const later = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    res = await move(mine.id, { stage: 'interview', interview: { at: later } });
    expect(res.body.interview.response).toBeUndefined();
    expect(res.body.interview.place).toBe('Cuttack'); // the job's city when no place is given
    expect(
      await prisma.notification.count({ where: { userId: s.worker.id, title: 'Interview time changed' } }),
    ).toBe(1);
  });

  it('only lets the worker reply when there is an interview', async () => {
    const { body: mine } = await apply();
    const res = await request(app)
      .post(`${API}/worker/applications/${mine.id}/interview-response`)
      .set(s.workerAuth)
      .send({ response: 'attending' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_INTERVIEW');
  });

  it('sends an offer that the worker accepts, then hires', async () => {
    const { body: mine } = await apply();
    let res = await move(mine.id, { stage: 'offer' });
    expect(res.status).toBe(422);

    res = await move(mine.id, {
      stage: 'offer',
      offer: { pay: 21000, joiningDate: '2020-01-01', place: 'Plant 1' },
    });
    expect(res.status).toBe(422);

    const offer = {
      pay: 21000,
      payPeriod: 'month',
      joiningDate: dateOnly(tomorrow()),
      place: 'Plant 1 gate',
    };
    res = await move(mine.id, { stage: 'offer', offer });
    expect(res.status).toBe(200);
    expect(res.body.offer).toMatchObject(offer);

    res = await request(app)
      .post(`${API}/worker/applications/${mine.id}/offer-response`)
      .set(s.workerAuth)
      .send({ response: 'accepted' });
    expect(res.body).toMatchObject({ stage: 'offer', offerResponse: 'accepted' });

    res = await move(mine.id, { stage: 'hired' });
    expect(res.body.stage).toBe('hired');
    const note = await prisma.notification.findFirst({
      where: { userId: s.worker.id, body: { contains: 'hired' } },
    });
    expect(note).not.toBeNull();
  });

  it('declining an offer closes the application', async () => {
    const { body: mine } = await apply();
    await move(mine.id, {
      stage: 'offer',
      offer: { pay: 700, payPeriod: 'day', joiningDate: dateOnly(tomorrow()), place: 'Site office' },
    });
    const res = await request(app)
      .post(`${API}/worker/applications/${mine.id}/offer-response`)
      .set(s.workerAuth)
      .send({ response: 'declined', note: 'Too far' });
    expect(res.body).toMatchObject({ stage: 'withdrawn', offerResponse: 'declined' });
    expect(res.body.timeline.at(-1)).toMatchObject({
      stage: 'withdrawn',
      note: 'Declined the offer: Too far',
    });
  });

  it('changing the offer clears the worker reply', async () => {
    const { body: mine } = await apply();
    const offer = { pay: 20000, joiningDate: dateOnly(tomorrow()), place: 'Plant 1' };
    await move(mine.id, { stage: 'offer', offer });
    await request(app)
      .post(`${API}/worker/applications/${mine.id}/offer-response`)
      .set(s.workerAuth)
      .send({ response: 'accepted' });

    const res = await move(mine.id, { stage: 'offer', offer: { ...offer, pay: 22000 } });
    expect(res.body.offer.pay).toBe(22000);
    expect(res.body.offerResponse).toBeUndefined();
  });

  it('workers cannot use employer routes', async () => {
    const { body: mine } = await apply();
    expect(
      (
        await request(app)
          .patch(`${API}/employer/applications/${mine.id}`)
          .set(s.workerAuth)
          .send({ stage: 'hired' })
      ).status,
    ).toBe(403);
  });
});
