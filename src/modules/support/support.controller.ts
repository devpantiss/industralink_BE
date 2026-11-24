import type { Request, Response } from 'express';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/auth.js';
import { supportRequestSchema, ticketListSchema } from './support.schemas.js';
import * as support from './support.service.js';

export async function create(req: Request, res: Response) {
  const input = supportRequestSchema.parse(req.body ?? {});
  await support.createTicket(req.auth?.user, input);
  res.status(201).json({ ok: true });
}

export async function list(req: Request, res: Response) {
  const { status } = ticketListSchema.parse(req.query);
  res.json(await support.listTickets(status));
}

export async function close(req: Request, res: Response) {
  await support.closeTicket(currentUser(req).id, parseId(req.params.id, 'Request'));
  res.json({ ok: true });
}
