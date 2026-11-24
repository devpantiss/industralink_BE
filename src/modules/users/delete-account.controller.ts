import type { Request, Response } from 'express';
import { z } from 'zod';
import { currentUser } from '../../middleware/auth.js';
import { deleteOwnAccount } from './delete-account.service.js';

const confirmSchema = z.object({
  confirm: z.literal('DELETE', 'Type DELETE to confirm.'),
});

/** POST /me/delete with { confirm: "DELETE" } */
export async function deleteAccount(req: Request, res: Response) {
  confirmSchema.parse(req.body ?? {});
  await deleteOwnAccount(currentUser(req));
  res.json({ ok: true });
}
