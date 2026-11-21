import type { Request, Response } from 'express';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import * as directory from './company-directory.service.js';
import { companyDirectorySchema } from './company.schemas.js';

export async function list(req: Request, res: Response) {
  res.json(await directory.listCompanies(companyDirectorySchema.parse(req.query)));
}

export async function get(req: Request, res: Response) {
  res.json(await directory.getCompanyForWorker(parseId(req.params.id, 'Company'), currentUser(req).id));
}
