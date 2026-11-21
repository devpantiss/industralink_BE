import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import type { User } from '../src/generated/prisma/client.js';
import { app, authHeader, createWorker, pathOf, samplePdf, samplePng } from './helpers.js';

let worker: User;
let auth: { Authorization: string };

const upload = (file: Buffer, name: string, type?: string) => {
  const req = request(app).post('/api/v1/worker/documents').set(auth).attach('file', file, name);
  return type ? req.field('type', type) : req;
};

beforeAll(async () => {
  worker = await createWorker();
  auth = await authHeader(worker);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('worker documents', () => {
  let firstResumeId: string;
  let secondResumeId: string;

  it('uploads a resume; the first one becomes the main resume', async () => {
    const res = await upload(samplePdf, 'My_Resume.pdf', 'resume');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ownerId: worker.id,
      name: 'My_Resume.pdf',
      type: 'resume',
      mimeType: 'application/pdf',
      isDefaultResume: true,
    });
    firstResumeId = res.body.id;

    const file = await request(app).get(pathOf(res.body.url));
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
  });

  it('a second resume is not the main one until chosen', async () => {
    const res = await upload(samplePdf, 'New_Resume.pdf', 'resume');
    expect(res.body.isDefaultResume).toBe(false);
    secondResumeId = res.body.id;

    const set = await request(app).post(`/api/v1/worker/documents/${secondResumeId}/default`).set(auth);
    expect(set.status).toBe(200);

    const list = await request(app).get('/api/v1/worker/documents').set(auth);
    const main = list.body.filter((doc: { isDefaultResume: boolean }) => doc.isDefaultResume);
    expect(main.map((doc: { id: string }) => doc.id)).toEqual([secondResumeId]);
  });

  it('deleting the main resume makes another resume the main one', async () => {
    const res = await request(app).delete(`/api/v1/worker/documents/${secondResumeId}`).set(auth);
    expect(res.status).toBe(200);
    const list = await request(app).get('/api/v1/worker/documents').set(auth);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: firstResumeId, isDefaultResume: true });
  });

  it('only a resume can be the main resume (422)', async () => {
    const id = await upload(samplePng, 'aadhaar.png', 'id_proof');
    expect(id.status).toBe(201);
    const res = await request(app).post(`/api/v1/worker/documents/${id.body.id}/default`).set(auth);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NOT_RESUME');
  });

  it('profile completeness counts uploaded documents', async () => {
    await upload(samplePdf, 'iti.pdf', 'iti_diploma');
    const res = await request(app).get('/api/v1/worker/profile').set(auth);
    const keys = res.body.completeness.missing.map((item: { key: string }) => item.key);
    expect(keys).not.toContain('resume');
    expect(keys).not.toContain('certificate');
  });

  it('rejects a file that only pretends to be a PDF (415)', async () => {
    const res = await upload(Buffer.from('hello, not a pdf'), 'fake.pdf', 'resume');
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('BAD_TYPE');
  });

  it('rejects files over 5 MB (413)', async () => {
    const big = Buffer.concat([samplePdf, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(big, 'big.pdf', 'resume');
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('TOO_BIG');
  });

  it('asks for a file when none is sent (400)', async () => {
    const res = await request(app).post('/api/v1/worker/documents').set(auth).field('type', 'resume');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_FILE');
  });

  it('rejects an unknown document type (422)', async () => {
    const res = await upload(samplePdf, 'x.pdf', 'passport_photo');
    expect(res.status).toBe(422);
  });

  it("can't touch another worker's documents (404)", async () => {
    const other = await authHeader(await createWorker());
    const res = await request(app).delete(`/api/v1/worker/documents/${firstResumeId}`).set(other);
    expect(res.status).toBe(404);
    const bad = await request(app).delete('/api/v1/worker/documents/not-an-id').set(other);
    expect(bad.status).toBe(404);
  });
});

describe('file links', () => {
  it('a changed or expired link does not work (403)', async () => {
    const res = await upload(samplePdf, 'cert.pdf', 'safety_cert');
    const url = new URL(res.body.url);

    const tampered = await request(app).get(
      `${url.pathname}?expires=${url.searchParams.get('expires')}&sig=abc`,
    );
    expect(tampered.status).toBe(403);
    expect(tampered.body.code).toBe('LINK_EXPIRED');

    const longer = Number(url.searchParams.get('expires')) + 3600;
    const extended = await request(app).get(
      `${url.pathname}?expires=${longer}&sig=${url.searchParams.get('sig')}`,
    );
    expect(extended.status).toBe(403);
  });

  it('unknown paths are 404', async () => {
    const res = await request(app).get('/files/../../etc/passwd');
    expect(res.status).toBe(404);
  });
});
