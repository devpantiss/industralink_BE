import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { adminUser, app, authHeader, createEmployer, samplePdf } from './helpers.js';

let admin: { Authorization: string };

beforeAll(async () => {
  admin = await authHeader(await adminUser());
});

afterAll(async () => {
  await prisma.$disconnect();
});

const decide = (companyId: string, body: object) =>
  request(app).post(`/api/v1/admin/verifications/company/${companyId}`).set(admin).send(body);

describe('admin company approval', () => {
  it('lists waiting companies with details and documents', async () => {
    const { company, user } = await createEmployer();
    await request(app)
      .post('/api/v1/employer/company/documents')
      .set(await authHeader(user))
      .field('type', 'gst')
      .attach('file', samplePdf, 'GST.pdf');

    const res = await request(app).get('/api/v1/admin/verifications').set(admin);
    expect(res.status).toBe(200);
    const item = res.body.find((row: { id: string }) => row.id === company.id);
    expect(item).toMatchObject({ kind: 'company', title: company.name, status: 'pending' });
    expect(item.subtitle).toBe('Metals & Steel · Cuttack');
    expect(item.details['HR contact']).toContain(user.email);
    expect(item.documents).toHaveLength(1);
    expect(item.documents[0].url).toContain('/files/companies/');
  });

  it('approves: company verified, HR activated, notified, logged', async () => {
    const { company, user } = await createEmployer();
    const res = await decide(company.id, { decision: 'approve' });
    expect(res.status).toBe(200);

    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(after.verification).toBe('approved');
    expect(after.verifiedAt).not.toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe('active');
    expect(await prisma.notification.count({ where: { userId: user.id, title: 'Company verified ✓' } })).toBe(
      1,
    );
    expect(await prisma.auditLog.count({ where: { targetId: company.id, action: 'company.approve' } })).toBe(
      1,
    );
  });

  it('reject needs a reason; the reason is saved and sent to HR', async () => {
    const { company, user } = await createEmployer();
    const noReason = await decide(company.id, { decision: 'reject' });
    expect(noReason.status).toBe(422);

    const res = await decide(company.id, { decision: 'reject', reason: 'GST number does not match' });
    expect(res.status).toBe(200);
    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(after).toMatchObject({ verification: 'rejected', rejectionReason: 'GST number does not match' });
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(note.body).toContain('GST number does not match');
  });

  it('a company can only be decided once (409 ALREADY_DONE)', async () => {
    const { company } = await createEmployer();
    await decide(company.id, { decision: 'approve' });
    const again = await decide(company.id, { decision: 'reject', reason: 'Changed my mind' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_DONE');
  });

  it('unknown company or kind is 404', async () => {
    expect((await decide('8f5b6f0e-1111-4c2a-9a1b-2b3c4d5e6f70', { decision: 'approve' })).status).toBe(404);
    const kind = await request(app)
      .post('/api/v1/admin/verifications/worker/8f5b6f0e-1111-4c2a-9a1b-2b3c4d5e6f70')
      .set(admin)
      .send({ decision: 'approve' });
    expect(kind.status).toBe(404);
  });

  it('is only for admins (403 for an employer)', async () => {
    const { user } = await createEmployer();
    const res = await request(app)
      .get('/api/v1/admin/verifications')
      .set(await authHeader(user));
    expect(res.status).toBe(403);
  });
});
