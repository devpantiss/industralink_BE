import type { Request, Response } from 'express';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import { reportJobSchema, reportListSchema, resolveReportSchema } from './report.schemas.js';
import * as reports from './report.service.js';

export async function reportJob(req: Request, res: Response) {
  const input = reportJobSchema.parse(req.body ?? {});
  await reports.reportJob(currentUser(req).id, parseId(req.params.id, 'Job'), input);
  res.status(201).json({ ok: true });
}

export async function list(req: Request, res: Response) {
  const { status } = reportListSchema.parse(req.query);
  res.json(await reports.listReports(status));
}

export async function resolve(req: Request, res: Response) {
  const input = resolveReportSchema.parse(req.body ?? {});
  await reports.resolveReport(currentUser(req).id, parseId(req.params.id, 'Report'), input);
  res.json({ ok: true });
}
