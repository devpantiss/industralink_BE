import { Router } from 'express';
import * as notifications from './notification.controller.js';

/** Mounted at /api/v1/notifications (any logged-in user, see routes.ts). */
export const notificationsRouter = Router();

notificationsRouter.get('/', notifications.list);
notificationsRouter.post('/read-all', notifications.markAllRead);
notificationsRouter.post('/:id/read', notifications.markRead);
