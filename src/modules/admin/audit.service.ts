import { prisma } from '../../db/prisma.js';
import type { Db } from '../../db/types.js';
import type { Prisma } from '../../generated/prisma/client.js';

export interface AuditInput {
  actorId: string;
  /** e.g. "company.approve" */
  action: string;
  targetType: string;
  targetId: string;
  details?: Prisma.InputJsonValue;
}

/** Records an admin action. Call it inside the same transaction as the change. */
export async function recordAudit(entry: AuditInput, db: Db = prisma): Promise<void> {
  await db.auditLog.create({ data: entry });
}
