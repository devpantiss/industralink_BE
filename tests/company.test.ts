import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import {
  app,
  authHeader,
  createEmployer,
  createWorker,
  pathOf,
  samplePdf,
  samplePngDataUrl,
} from './helpers.js';

let companyId: string;
let auth: { Authorization: string };

beforeAll(async () => {
  const { company, user } = await createEmployer();
  companyId = company.id;
  auth = await authHeader(user);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET/PATCH /employer/company', () => {
  it('returns the company in the app shape', async () => {
    const res = await request(app).get('/api/v1/employer/company').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: companyId,
      sector: 'metals',
      location: { city: 'Cuttack', state: 'Odisha' },
      verification: 'pending',
      sites: [],
    });
  });

  it('saves details; HR phone and GST are normalised', async () => {
    const res = await request(app)
      .patch('/api/v1/employer/company')
      .set(auth)
      .send({
        name: 'Brahmani Fabrication Works',
        hrPhone: '+91 98765-43210',
        gstNumber: '21aaacb0000a1z5',
        sites: ['Plant 1', 'Plant 1', 'Yard'],
        hiringType: 'direct',
        location: { city: 'Rourkela', state: 'Odisha' },
        verification: 'approved', // ignored: only admins change this
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Brahmani Fabrication Works',
      hrPhone: '9876543210',
      gstNumber: '21AAACB0000A1Z5',
      sites: ['Plant 1', 'Yard'],
      location: { city: 'Rourkela', state: 'Odisha' },
      verification: 'pending',
    });
  });

  it.each([
    [{ hrPhone: '12345' }, 'hrPhone'],
    [{ gstNumber: 'ABC' }, 'gstNumber'],
    [{ pincode: '7' }, 'pincode'],
    [{ sector: 'space' }, 'sector'],
  ])('rejects bad data %j (422)', async (body, field) => {
    const res = await request(app).patch('/api/v1/employer/company').set(auth).send(body);
    expect(res.status).toBe(422);
    expect(res.body.message).toContain(field);
  });

  it('saves a logo', async () => {
    const res = await request(app)
      .patch('/api/v1/employer/company')
      .set(auth)
      .send({ logoUrl: samplePngDataUrl });
    expect(res.body.logoUrl).toMatch(/\/files\/companies\/.+\/logo\//);
    expect((await request(app).get(pathOf(res.body.logoUrl))).status).toBe(200);
  });

  it('a rejected company can resubmit for review', async () => {
    await prisma.company.update({
      where: { id: companyId },
      data: { verification: 'rejected', rejectionReason: 'GST does not match' },
    });
    const res = await request(app).patch('/api/v1/employer/company').set(auth).send({ resubmit: true });
    expect(res.body.verification).toBe('pending');
    expect(res.body.rejectionReason).toBeUndefined();
  });

  it('is only for employers (403 for a worker)', async () => {
    const res = await request(app)
      .get('/api/v1/employer/company')
      .set(await authHeader(await createWorker()));
    expect(res.status).toBe(403);
  });
});

describe('company documents', () => {
  it('uploads, lists and deletes while waiting for approval', async () => {
    const up = await request(app)
      .post('/api/v1/employer/company/documents')
      .set(auth)
      .field('type', 'gst')
      .attach('file', samplePdf, 'GST_Certificate.pdf');
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ companyId, type: 'gst', name: 'GST_Certificate.pdf' });

    const list = await request(app).get('/api/v1/employer/company/documents').set(auth);
    expect(list.body).toHaveLength(1);

    const del = await request(app).delete(`/api/v1/employer/company/documents/${up.body.id}`).set(auth);
    expect(del.status).toBe(200);
  });

  it("can't delete documents once the company is approved (409 LOCKED)", async () => {
    const up = await request(app)
      .post('/api/v1/employer/company/documents')
      .set(auth)
      .field('type', 'udyam')
      .attach('file', samplePdf, 'Udyam.pdf');
    await prisma.company.update({ where: { id: companyId }, data: { verification: 'approved' } });

    const res = await request(app).delete(`/api/v1/employer/company/documents/${up.body.id}`).set(auth);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LOCKED');
  });
});
