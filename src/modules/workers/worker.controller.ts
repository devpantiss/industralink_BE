import type { Request, Response } from 'express';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import * as documents from './worker-documents.service.js';
import { updateWorkerProfileSchema, uploadWorkerDocumentSchema } from './worker.schemas.js';
import * as profiles from './worker.service.js';

export async function getProfile(req: Request, res: Response) {
  res.json(await profiles.getWorkerProfile(currentUser(req).id));
}

export async function updateProfile(req: Request, res: Response) {
  const input = updateWorkerProfileSchema.parse(req.body ?? {});
  res.json(await profiles.updateWorkerProfile(currentUser(req).id, input));
}

export async function listDocuments(req: Request, res: Response) {
  res.json(await documents.listWorkerDocuments(currentUser(req).id));
}

export async function uploadDocument(req: Request, res: Response) {
  const { type } = uploadWorkerDocumentSchema.parse(req.body ?? {});
  res.status(201).json(await documents.uploadWorkerDocument(currentUser(req).id, req.file, type));
}

export async function deleteDocument(req: Request, res: Response) {
  await documents.deleteWorkerDocument(currentUser(req).id, parseId(req.params.id, 'Document'));
  res.json({ ok: true });
}

export async function setDefaultResume(req: Request, res: Response) {
  await documents.setDefaultResume(currentUser(req).id, parseId(req.params.id, 'Document'));
  res.json({ ok: true });
}
