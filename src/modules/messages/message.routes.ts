import { Router } from 'express';
import { chatSendLimiter } from '../../middleware/rate-limit.js';
import * as messages from './message.controller.js';

/** Mounted at /api/v1/messages (workers and employers, see routes.ts). */
export const messagesRouter = Router();

messagesRouter.get('/', messages.inbox);
messagesRouter.get('/:applicationId', messages.thread);
messagesRouter.post('/:applicationId', chatSendLimiter, messages.send);
messagesRouter.post('/:applicationId/read', messages.markRead);
