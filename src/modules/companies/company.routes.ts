import { Router } from 'express';
import { singleFileUpload } from '../files/upload.js';
import * as company from './company.controller.js';

/** Mounted at /api/v1/employer/company (employers only, see routes.ts). */
export const companyRouter = Router();

companyRouter.get('/', company.getCompany);
companyRouter.patch('/', company.updateCompany);

companyRouter.get('/documents', company.listDocuments);
companyRouter.post('/documents', singleFileUpload, company.uploadDocument);
companyRouter.delete('/documents/:id', company.deleteDocument);
