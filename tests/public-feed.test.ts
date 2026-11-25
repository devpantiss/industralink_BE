import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, createEmployer, createJobInDb, uniqueWord } from './helpers.js';

describe('GET /public/feed (landing site)', () => {
  it('lists open jobs of approved companies only, without private details', async () => {
    const { company } = await createEmployer({ verification: 'approved' });
    const { company: waiting } = await createEmployer({ verification: 'pending' });
    const title = uniqueWord();
    const open = await createJobInDb(company.id, { title, hrPhone: '+919000000009' });
    await createJobInDb(company.id, { title, status: 'draft' });
    await createJobInDb(company.id, { title, status: 'closed' });
    await createJobInDb(waiting.id, { title });

    const res = await request(app).get('/api/v1/public/feed').expect(200);

    expect(res.headers['access-control-allow-origin']).toBe('*');
    const mine = res.body.jobs.filter((job: { title: string }) => job.title === title);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: open.id, employerType: 'Metals plant', city: 'Cuttack' });
    expect(JSON.stringify(mine[0])).not.toMatch(/9000000009|companyName|hrPhone/);
    expect(res.body.totals.jobs).toBe(res.body.jobs.length);
  });
});
