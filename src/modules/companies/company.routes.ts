import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { singleFileUpload } from '../files/upload.js';
import * as company from './company.controller.js';

/** Everything under /api/v1/employer. Employers only. */
export const employerRouter = Router();

employerRouter.use(requireAuth, requireRole('employer'));

employerRouter.get('/company', company.getCompany);
employerRouter.patch('/company', company.updateCompany);

employerRouter.get('/company/documents', company.listDocuments);
employerRouter.post('/company/documents', singleFileUpload, company.uploadDocument);
employerRouter.delete('/company/documents/:id', company.deleteDocument);
