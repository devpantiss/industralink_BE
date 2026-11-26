import { Router } from 'express';
import * as pushTokens from './push-token.controller.js';

/** Mounted at /api/v1/me/push-token (any logged-in user, see routes.ts). */
export const pushTokenRouter = Router();

pushTokenRouter.put('/', pushTokens.save);
pushTokenRouter.delete('/', pushTokens.remove);
