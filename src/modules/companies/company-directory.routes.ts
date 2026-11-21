import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { SECTORS } from '../../lib/catalog.js';
import { blankToUndefined, parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import * as directory from './company-directory.service.js';

const listSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  sector: z.preprocess(blankToUndefined, z.enum(SECTORS).optional()),
});

async function list(req: Request, res: Response) {
  res.json(await directory.listCompanies(listSchema.parse(req.query)));
}

async function get(req: Request, res: Response) {
  res.json(await directory.getCompanyForWorker(parseId(req.params.id, 'Company'), currentUser(req).id));
}

/** Mounted at /api/v1/companies (workers only, see routes.ts). */
export const companyDirectoryRouter = Router();
companyDirectoryRouter.get('/', list);
companyDirectoryRouter.get('/:id', get);
