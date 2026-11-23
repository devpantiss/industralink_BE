import { Router } from 'express';
import * as home from './home.controller.js';

/** Home screen numbers. Each is mounted under its role's area in routes.ts (GET .../summary). */
export const workerHomeRouter = Router();
workerHomeRouter.get('/summary', home.workerHome);

export const employerHomeRouter = Router();
employerHomeRouter.get('/summary', home.employerHome);

export const adminHomeRouter = Router();
adminHomeRouter.get('/summary', home.adminHome);
