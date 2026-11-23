import { prisma } from '../../db/prisma.js';
import { notify } from '../notifications/notification.service.js';

interface Message {
  title: string;
  body: string;
  link: string;
}

/** Tells every HR user of the company (blocked users are skipped). */
export async function notifyCompanyHr(companyId: string, message: Message) {
  const hrUsers = await prisma.user.findMany({
    where: { companyId, role: 'employer', status: { not: 'blocked' } },
    select: { id: true },
  });
  await notify(hrUsers.map((hr) => ({ userId: hr.id, ...message })));
}

/** Tells the worker about a change HR made to their application. */
export function notifyWorker(workerId: string, applicationId: string, title: string, body: string) {
  return notify([{ userId: workerId, title, body, link: `/worker/applications/${applicationId}` }]);
}
