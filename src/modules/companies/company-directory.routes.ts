import { Router } from 'express';
import * as directory from './company-directory.controller.js';

/** Mounted at /api/v1/companies (workers only, see routes.ts). */
export const companyDirectoryRouter = Router();
companyDirectoryRouter.get('/', directory.list);
companyDirectoryRouter.get('/:id', directory.get);
