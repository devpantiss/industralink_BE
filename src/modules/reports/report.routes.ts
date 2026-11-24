import { Router } from 'express';
import * as reports from './report.controller.js';

/** Mounted at /api/v1/jobs next to the job search (workers only, see routes.ts). */
export const reportJobRouter = Router();
reportJobRouter.post('/:id/report', reports.reportJob);

/** Mounted at /api/v1/admin/reports (admins only). */
export const adminReportsRouter = Router();
adminReportsRouter.get('/', reports.list);
adminReportsRouter.post('/:id', reports.resolve);
