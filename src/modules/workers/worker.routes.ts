import { Router } from 'express';
import { singleFileUpload } from '../files/upload.js';
import * as worker from './worker.controller.js';

/** Mounted at /api/v1/worker (workers only, see routes.ts). */
export const workerProfileRouter = Router();

workerProfileRouter.get('/profile', worker.getProfile);
workerProfileRouter.patch('/profile', worker.updateProfile);

workerProfileRouter.get('/documents', worker.listDocuments);
workerProfileRouter.post('/documents', singleFileUpload, worker.uploadDocument);
workerProfileRouter.delete('/documents/:id', worker.deleteDocument);
workerProfileRouter.post('/documents/:id/default', worker.setDefaultResume);
