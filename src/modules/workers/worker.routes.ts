import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { singleFileUpload } from '../files/upload.js';
import * as worker from './worker.controller.js';

/** Everything under /api/v1/worker. Workers only. */
export const workerRouter = Router();

workerRouter.use(requireAuth, requireRole('worker'));

workerRouter.get('/profile', worker.getProfile);
workerRouter.patch('/profile', worker.updateProfile);

workerRouter.get('/documents', worker.listDocuments);
workerRouter.post('/documents', singleFileUpload, worker.uploadDocument);
workerRouter.delete('/documents/:id', worker.deleteDocument);
workerRouter.post('/documents/:id/default', worker.setDefaultResume);
