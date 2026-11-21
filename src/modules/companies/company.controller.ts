import type { Request, Response } from 'express';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import { updateCompanySchema, uploadCompanyDocumentSchema } from './company.schemas.js';
import * as companies from './company.service.js';

export async function getCompany(req: Request, res: Response) {
  res.json(await companies.getCompany(companies.companyIdOf(currentUser(req))));
}

export async function updateCompany(req: Request, res: Response) {
  const input = updateCompanySchema.parse(req.body ?? {});
  res.json(await companies.updateCompany(companies.companyIdOf(currentUser(req)), input));
}

export async function listDocuments(req: Request, res: Response) {
  res.json(await companies.listCompanyDocuments(companies.companyIdOf(currentUser(req))));
}

export async function uploadDocument(req: Request, res: Response) {
  const { type } = uploadCompanyDocumentSchema.parse(req.body ?? {});
  const companyId = companies.companyIdOf(currentUser(req));
  res.status(201).json(await companies.uploadCompanyDocument(companyId, req.file, type));
}

export async function deleteDocument(req: Request, res: Response) {
  const companyId = companies.companyIdOf(currentUser(req));
  await companies.deleteCompanyDocument(companyId, parseId(req.params.id, 'Document'));
  res.json({ ok: true });
}
